/**
 * Printing. Chromium prints what is in the DOM, and the viewer only ever has a
 * handful of pages there, so before the print dialog opens we build a hidden
 * sheet holding EVERY page rastered at print resolution. `print.css` hides the
 * app and shows that sheet for `@media print` only.
 *
 * Preparing a long document takes real time, so it reports "Preparing page N of
 * M" on the status bar the whole way through.
 *
 * The sheet alone is not enough to get the page count right: the paper has to
 * be named too. A `<style>` carrying the document's own page size as an @page
 * rule is injected here while the sheet is up and removed with it — see
 * print-layout.ts for why leaving the size to Chromium printed every page twice.
 */

import { useAppStore, getSessionBytes } from '../../app/store';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { acquireDocument, releaseDocument } from './pdf-document-cache';
import { PAGE_STYLE_ID, mixedSizeNotice, pageSizeRule } from './print-layout';
import type { PrintPageSize } from './print-layout';

/** Print resolution. Long documents drop down so the sheet stays in memory. */
const DPI_SMALL = 150;
const DPI_LARGE = 110;
const LARGE_DOCUMENT = 200;

export interface PrintSheetState {
  /** Blob URLs, one per page, in document order. */
  pages: readonly string[];
  total: number;
}

const EMPTY: PrintSheetState = { pages: [], total: 0 };
let state: PrintSheetState = EMPTY;
/** Bumped by finishPrint (and by a second print), so an in-flight prepare stops. */
let generation = 0;
const listeners = new Set<() => void>();

export function subscribePrintSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPrintSheet(): PrintSheetState {
  return state;
}

function publish(next: PrintSheetState): void {
  state = next;
  for (const listener of listeners) listener();
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** The paper the sheet prints on. Replaces any rule left by an earlier print. */
function applyPageSize(size: PrintPageSize): void {
  removePageSize();
  const style = document.createElement('style');
  style.id = PAGE_STYLE_ID;
  style.textContent = pageSizeRule(size);
  // Last in <head>: it has to outrank the `size: auto` fallback in print.css.
  document.head.append(style);
}

function removePageSize(): void {
  document.getElementById(PAGE_STYLE_ID)?.remove();
}

interface RenderedPage {
  url: string;
  /** The page box in points, /Rotate applied — what the paper must match. */
  size: PrintPageSize;
}

async function renderPageImage(
  pdf: PDFDocumentProxy,
  page: number,
  scale: number
): Promise<RenderedPage> {
  const pdfPage = await pdf.getPage(page);
  const viewport = pdfPage.getViewport({ scale });
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The browser refused a 2D canvas context.');
  // pdfjs renders into the context when `canvas` is explicitly null.
  await pdfPage.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  if (blob.size === 0) throw new Error(`Page ${page} produced no printable image.`);
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  // Decoded up front so the print dialog never captures a half-drawn sheet.
  await image.decode();
  return { url, size: { width: viewport.width / scale, height: viewport.height / scale } };
}

/**
 * Build the hidden print sheet for a document. Call `finishPrint()` afterwards,
 * whether the dialog was used or cancelled.
 */
export async function preparePrint(docId: string): Promise<void> {
  const bytes = getSessionBytes(docId);
  if (bytes === undefined) throw new Error('That document is not open any more.');
  const store = useAppStore.getState();
  const mine = ++generation;
  const pdf = await acquireDocument(bytes);
  try {
    const total = pdf.numPages;
    const scale = (total > LARGE_DOCUMENT ? DPI_LARGE : DPI_SMALL) / 72;
    const pages: string[] = [];
    const sizes: PrintPageSize[] = [];
    for (let page = 1; page <= total; page += 1) {
      store.setBusy(`Preparing page ${page} of ${total} for printing`);
      const rendered = await renderPageImage(pdf, page, scale);
      pages.push(rendered.url);
      sizes.push(rendered.size);
      if (generation !== mine) {
        for (const url of pages) URL.revokeObjectURL(url);
        throw new Error('Preparing the document for printing was stopped.');
      }
      publish({ pages: [...pages], total });
    }
    if (pages.length !== total) {
      throw new Error(`Only ${pages.length} of ${total} pages could be prepared for printing.`);
    }
    settlePaper(docId, sizes);
    await nextPaint();
    await nextPaint();
  } finally {
    store.setBusy(null);
    releaseDocument(bytes);
  }
}

/** Name the paper, and say so when the document is not all one size. */
function settlePaper(docId: string, sizes: readonly PrintPageSize[]): void {
  const first = sizes[0];
  if (first === undefined) throw new Error('That document has no pages to print.');
  applyPageSize(first);
  const notice = mixedSizeNotice(sizes);
  if (notice !== null) useAppStore.getState().setNotice(notice, docId);
}

/** Drop the sheet, stop any prepare still running, and free the rasters. Safe to call twice. */
export function finishPrint(): void {
  generation += 1;
  removePageSize();
  for (const url of state.pages) URL.revokeObjectURL(url);
  publish(EMPTY);
}

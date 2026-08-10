/**
 * Printing. Chromium prints what is in the DOM, and the viewer only ever has a
 * handful of pages there, so before the print dialog opens we build a hidden
 * sheet holding EVERY page rastered at print resolution. `print.css` hides the
 * app and shows that sheet for `@media print` only.
 *
 * Preparing a long document takes real time, so it reports "Preparing page N of
 * M" on the status bar the whole way through.
 */

import { useAppStore, getSessionBytes } from '../../app/store';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { acquireDocument, releaseDocument } from './pdf-document-cache';

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

async function renderPageImage(
  pdf: PDFDocumentProxy,
  page: number,
  scale: number
): Promise<string> {
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
  return url;
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
    for (let page = 1; page <= total; page += 1) {
      store.setBusy(`Preparing page ${page} of ${total} for printing`);
      pages.push(await renderPageImage(pdf, page, scale));
      if (generation !== mine) {
        for (const url of pages) URL.revokeObjectURL(url);
        throw new Error('Preparing the document for printing was stopped.');
      }
      publish({ pages: [...pages], total });
    }
    if (pages.length !== total) {
      throw new Error(`Only ${pages.length} of ${total} pages could be prepared for printing.`);
    }
    await nextPaint();
    await nextPaint();
  } finally {
    store.setBusy(null);
    releaseDocument(bytes);
  }
}

/** Drop the sheet, stop any prepare still running, and free the rasters. Safe to call twice. */
export function finishPrint(): void {
  generation += 1;
  for (const url of state.pages) URL.revokeObjectURL(url);
  publish(EMPTY);
}

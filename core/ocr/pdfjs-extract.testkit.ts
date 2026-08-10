/**
 * TEST SUPPORT ONLY — never imported by shipping code.
 *
 * Reads text back out of a PDF with pdfjs, the same engine the Librarius viewer
 * renders with, so a text-layer assertion means "the attorney can select and
 * search this", not "we emitted the operators we meant to". pdfjs is loaded
 * dynamically through a hand-written minimal interface so this Node-side helper
 * never drags DOM types into the core zone's tsconfig.
 */

import { fileURLToPath } from 'node:url';

export interface ExtractedTextItem {
  str: string;
  /** Position of the text origin in PDF user space. */
  x: number;
  y: number;
  /** Rendered width in points — proves the horizontal stretch landed. */
  width: number;
}

interface PdfJsTextItem {
  str?: string;
  transform?: number[];
  width?: number;
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: PdfJsTextItem[] }>;
}

interface PdfJsDocument {
  numPages: number;
  getPage(page: number): Promise<PdfJsPage>;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
  destroy(): Promise<void>;
}

interface PdfJsModule {
  getDocument(parameters: {
    data: Uint8Array;
    standardFontDataUrl?: string;
    isEvalSupported?: boolean;
  }): PdfJsLoadingTask;
}

const STANDARD_FONTS = fileURLToPath(
  new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)
);

async function loadPdfJs(): Promise<PdfJsModule> {
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule;
}

/** Every text item on one 1-based page, in PDF user space. */
export async function extractTextItems(
  bytes: Uint8Array,
  page: number
): Promise<ExtractedTextItem[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONTS,
    isEvalSupported: false,
  });
  try {
    const document = await task.promise;
    const content = await (await document.getPage(page)).getTextContent();
    return content.items
      .filter((item) => (item.str ?? '').trim().length > 0)
      .map((item) => ({
        str: item.str ?? '',
        x: item.transform?.[4] ?? Number.NaN,
        y: item.transform?.[5] ?? Number.NaN,
        width: item.width ?? Number.NaN,
      }));
  } finally {
    await task.destroy();
  }
}

/** All text in a document, page by page — used by the end-to-end OCR proof. */
export async function extractAllText(bytes: Uint8Array, pageCount: number): Promise<string[]> {
  const pages: string[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const items = await extractTextItems(bytes, page);
    pages.push(items.map((item) => item.str).join(' '));
  }
  return pages;
}

/**
 * Full-document text extraction, in the renderer, because pdfjs lives here.
 * Centurion feeds the result to Claude, so every page is labelled `[Page N]`
 * and the model is told to cite those numbers.
 *
 * Range discipline (engineering rule 1): the requested pages are validated
 * against the REAL page count before anything is read. A window that would
 * collapse to nothing throws; it never returns an empty string that would
 * silently become an empty prompt.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadDocument } from './pdfjs';

export interface ExtractedText {
  /** Page-labelled text, ready to hand to Centurion. Never empty. */
  text: string;
  /** The pages actually read, 1-based and ascending. */
  pages: number[];
  /** Characters found per page, in `pages` order. A zero is an image-only page. */
  charsPerPage: number[];
}

/** Thrown when the whole selection is image-only: the fix is OCR, not a retry. */
export class NoTextLayerError extends Error {
  readonly code = 'NO_TEXT_LAYER';
  constructor(readonly pages: number[]) {
    super(
      pages.length === 1
        ? `Page ${pages[0]} has no text yet. Run Text Recognition first, then ask again.`
        : `These ${pages.length} pages have no text yet. Run Text Recognition first, then ask again.`
    );
    this.name = 'NoTextLayerError';
  }
}

/**
 * Validate a requested page selection against the real document length.
 * `undefined` means the whole document. Duplicates collapse, order is normalised,
 * and anything outside 1..pageCount is a loud error.
 */
export function resolveTextPages(
  requested: readonly number[] | undefined,
  pageCount: number
): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new RangeError(`Cannot read text from a document with ${pageCount} pages.`);
  }
  if (requested === undefined) {
    return Array.from({ length: pageCount }, (_unused, index) => index + 1);
  }
  for (const page of requested) {
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new RangeError(
        `Cannot read page ${page}: this document has pages 1 through ${pageCount}.`
      );
    }
  }
  const unique = [...new Set(requested)].sort((left, right) => left - right);
  if (unique.length === 0) {
    throw new RangeError(`No pages selected: this document has pages 1 through ${pageCount}.`);
  }
  return unique;
}

/** The `[Page N]` block Centurion is told to cite from. */
export function pageBlock(page: number, text: string): string {
  return `[Page ${page}]\n${text}`;
}

interface TextContentItem {
  str: string;
  hasEOL: boolean;
}

function isTextItem(item: unknown): item is TextContentItem {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as { str?: unknown; hasEOL?: unknown };
  return typeof candidate.str === 'string' && typeof candidate.hasEOL === 'boolean';
}

async function readPageText(document: PDFDocumentProxy, page: number): Promise<string> {
  const proxy = await document.getPage(page);
  const content = await proxy.getTextContent();
  let text = '';
  for (const item of content.items) {
    if (!isTextItem(item)) continue;
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return text.trim();
}

/**
 * Extract text for the whole document, or for a validated page range on a huge
 * one. Throws `NoTextLayerError` when the entire selection is image-only rather
 * than handing Centurion an empty document.
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  requested?: readonly number[]
): Promise<ExtractedText> {
  const document = await loadDocument(bytes);
  try {
    const pages = resolveTextPages(requested, document.numPages);
    const blocks: string[] = [];
    const charsPerPage: number[] = [];
    for (const page of pages) {
      const pageText = await readPageText(document, page);
      charsPerPage.push(pageText.length);
      blocks.push(pageBlock(page, pageText));
    }
    if (charsPerPage.every((count) => count === 0)) throw new NoTextLayerError(pages);
    return { text: blocks.join('\n\n'), pages, charsPerPage };
  } finally {
    // pdfjs 6 tears the worker down through the loading task, not the proxy.
    await document.loadingTask.destroy();
  }
}

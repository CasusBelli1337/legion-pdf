/**
 * Pure PDF metadata reads. Node-safe: no Electron, no DOM, no React.
 * Kept out of core/ops/ so the ops lane owns that directory outright.
 */

import { PDFDocument } from 'pdf-lib';

/** Loud failure beats a silently-empty document. */
export class EmptyDocumentError extends Error {
  readonly code = 'EMPTY_DOCUMENT';
  constructor(message: string) {
    super(message);
    this.name = 'EmptyDocumentError';
  }
}

/**
 * Page count of a PDF byte array. Throws EmptyDocumentError on empty bytes or
 * a zero-page document rather than reporting a successful open of nothing.
 */
export async function countPages(bytes: Uint8Array): Promise<number> {
  if (bytes.byteLength === 0) {
    throw new EmptyDocumentError('The file is empty (0 bytes) — nothing to open.');
  }
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const pageCount = document.getPageCount();
  if (pageCount < 1) {
    throw new EmptyDocumentError('The PDF reports zero pages — refusing to open it.');
  }
  return pageCount;
}

/**
 * Guard for any 1-based page index before it is used to slice a document.
 * A collapsed window must error loudly, never produce an empty result.
 */
export function assertPageInRange(page: number, pageCount: number, label = 'page'): void {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new RangeError(
      `Invalid ${label} ${page}: this document has pages 1 through ${pageCount}.`
    );
  }
}

/**
 * Loading, saving, and the count verification every op runs before it returns.
 * Nothing in core/ops writes a result without proving it re-opens with the page
 * count the caller expected — silent under-production is the failure this
 * codebase fears most, and it looks exactly like success.
 */

import { PDFDocument } from 'pdf-lib';
import type { OpResult } from '@shared/types';
import { EmptyDocumentError, countPages } from '../pdf-meta';

/** Encrypted files still open read-only; metadata is never rewritten behind the user. */
const LOAD_OPTIONS = { ignoreEncryption: true, updateMetadata: false } as const;

/** Reports "current of total" while a multi-page op runs. Wired to `ops:progress`. */
export type ProgressReporter = (current: number, total: number) => void;

/** Parses bytes into a document, refusing an empty or page-less file loudly. */
export async function loadPdf(bytes: Uint8Array, label = 'document'): Promise<PDFDocument> {
  if (bytes.byteLength === 0) {
    throw new EmptyDocumentError(`The ${label} is empty (0 bytes) — nothing to work with.`);
  }
  const document = await PDFDocument.load(bytes, LOAD_OPTIONS);
  if (document.getPageCount() < 1) {
    throw new EmptyDocumentError(`The ${label} reports zero pages — refusing to work on it.`);
  }
  return document;
}

/** A blank document with no producer/creator stamp of its own. */
export function createPdf(): Promise<PDFDocument> {
  return PDFDocument.create({ updateMetadata: false });
}

/** Serializes and refuses to hand back an empty byte array. */
export async function savePdf(document: PDFDocument, label = 'result'): Promise<Uint8Array> {
  const bytes = await document.save();
  if (bytes.byteLength === 0) {
    throw new Error(`Writing the ${label} produced no bytes — the operation was abandoned.`);
  }
  return bytes;
}

/**
 * The single exit door for every op: save, re-open the SAVED bytes, and prove
 * the page count matches what the op promised. Verifying the output rather than
 * the in-memory document is the point — it catches a writer that dropped pages.
 */
export async function finish<T>(
  document: PDFDocument,
  pagesIn: number,
  expectedOut: number,
  detail: T,
  label = 'result'
): Promise<OpResult<T>> {
  const bytes = await savePdf(document, label);
  return sealResult(bytes, pagesIn, expectedOut, detail, label);
}

/** `finish` for ops that already hold their output bytes (split parts, extracts). */
export async function sealResult<T>(
  bytes: Uint8Array,
  pagesIn: number,
  expectedOut: number,
  detail: T,
  label = 'result'
): Promise<OpResult<T>> {
  if (bytes.byteLength === 0) {
    throw new Error(`The ${label} came back empty — refusing to report success.`);
  }
  const pagesOut = await countPages(bytes);
  if (pagesOut !== expectedOut) {
    throw new Error(
      `The ${label} came out with ${pagesOut} pages but ${expectedOut} were expected — ` +
        'the operation was abandoned rather than saved.'
    );
  }
  return { bytes, pagesIn, pagesOut, detail };
}

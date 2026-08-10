/**
 * The one place pdfjs is configured. The worker is bundled by Vite as a local
 * asset (never a CDN) — the app must render offline. Every renderer module that
 * needs pdfjs imports it from here so there is exactly one worker setup.
 */

import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export { getDocument };
export type { PDFDocumentProxy };

/**
 * Load a document from bytes. pdfjs takes ownership of the buffer it is given,
 * so the caller's copy is cloned first — the store's bytes stay intact.
 */
export async function loadDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  if (bytes.byteLength === 0) throw new Error('Cannot open an empty document.');
  return getDocument({ data: new Uint8Array(bytes) }).promise;
}

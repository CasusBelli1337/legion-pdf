/**
 * The one place pdfjs is configured. The worker is bundled by Vite as a local
 * asset (never a CDN) — the app must render offline. Every renderer module that
 * needs pdfjs imports it from here so there is exactly one worker setup.
 */

import { AnnotationLayer, AnnotationMode, GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Decoder/font assets, synced into public/pdfjs by scripts/sync-pdfjs-assets.mjs.
 * wasmUrl is what makes JBIG2/JPX scans render — i.e. every Acrobat-scanned
 * court filing; without it those pages paint pure white (the 2026-08-19
 * Ashford petition bug). Resolved against the document base so the same
 * relative layout works from the dev server and from file:// in the
 * packaged build.
 */
const assetUrl = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href;
const PDFJS_ASSETS = {
  wasmUrl: assetUrl('wasm'),
  cMapUrl: assetUrl('cmaps'),
  cMapPacked: true,
  standardFontDataUrl: assetUrl('standard_fonts'),
} as const;

export { AnnotationLayer, AnnotationMode, getDocument };
export type { PDFDocumentProxy };

/**
 * Load a document from bytes. pdfjs takes ownership of the buffer it is given,
 * so the caller's copy is cloned first — the store's bytes stay intact.
 */
export async function loadDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  if (bytes.byteLength === 0) throw new Error('Cannot open an empty document.');
  return getDocument({ data: new Uint8Array(bytes), ...PDFJS_ASSETS }).promise;
}

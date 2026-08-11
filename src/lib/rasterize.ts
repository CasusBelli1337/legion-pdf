/**
 * Page → PNG, in the renderer, because pdfjs needs a canvas and only this zone
 * has one. Main-process pipelines (OCR, redaction) reach this over
 * `raster:request` / `raster:response` so screen and pipeline share one engine.
 */

import type { RasterRequest, RasterResponse } from '@shared/types';
import type { Unsubscribe } from '@shared/bridge';
import { DetachedDocuments } from './detached-raster';
import { loadDocument } from './pdfjs';
import type { PDFDocumentProxy } from './pdfjs';
import { assertRasterPage, canvasSizeFor, dpiToScale } from './raster-geometry';

export interface PageRaster {
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
}

/** Rasterize one 1-based page at the given DPI. Throws rather than return empty. */
export async function rasterizePage(
  bytes: Uint8Array,
  page: number,
  dpi: number
): Promise<PageRaster> {
  const document = await loadDocument(bytes);
  try {
    return await renderPage(document, page, dpi);
  } finally {
    // pdfjs 6 tears the worker down through the loading task, not the proxy.
    await document.loadingTask.destroy();
  }
}

async function renderPage(
  document: PDFDocumentProxy,
  page: number,
  dpi: number
): Promise<PageRaster> {
  assertRasterPage(page, document.numPages);
  const pdfPage = await document.getPage(page);
  const viewport = pdfPage.getViewport({ scale: dpiToScale(dpi) });
  const { widthPx, heightPx } = canvasSizeFor(viewport.width, viewport.height);
  const canvas = new OffscreenCanvas(widthPx, heightPx);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The browser refused a 2D canvas context.');

  // pdfjs renders into the context when `canvas` is explicitly null.
  await pdfPage.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const png = new Uint8Array(await blob.arrayBuffer());
  if (png.byteLength === 0) throw new Error(`Rasterizing page ${page} produced no image data.`);
  return { png, widthPx, heightPx };
}

/**
 * A tab's bytes are already here; anything else is a document main opened
 * without a tab (bulk OCR), whose bytes are fetched back over `file:read`.
 */
async function answer(
  request: RasterRequest,
  getBytes: (docId: string) => Uint8Array | undefined,
  detached: DetachedDocuments
): Promise<RasterResponse> {
  const bytes = getBytes(request.docId);
  const raster =
    bytes === undefined
      ? await renderPage(await detached.open(request.docId), request.page, request.dpi)
      : await rasterizePage(bytes, request.page, request.dpi);
  return { requestId: request.requestId, ...raster };
}

/**
 * Wire the renderer half of the raster round-trip. Call once at app start;
 * the returned function unsubscribes and drops any detached document.
 */
export function registerRasterResponder(
  getBytes: (docId: string) => Uint8Array | undefined
): Unsubscribe {
  const detached = new DetachedDocuments();
  const unsubscribe = window.librarius.raster.onRequest((request) => {
    void answer(request, getBytes, detached)
      .catch((error: unknown) => ({
        requestId: request.requestId,
        png: null,
        widthPx: 0,
        heightPx: 0,
        error: error instanceof Error ? error.message : String(error),
      }))
      .then((response) => window.librarius.raster.respond(response));
  });
  return () => {
    unsubscribe();
    void detached.dispose();
  };
}

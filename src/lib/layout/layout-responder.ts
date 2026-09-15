/**
 * The renderer half of `layout:request` / `layout:response`, the same shape as
 * the raster round-trip (lib/rasterize.ts). Main asks for a page's layout by
 * document id; this finds the pdfjs document (the open tab's, or one loaded
 * from the store for a document with no tab), classifies the page with the
 * selection engine so headers, footers, and line numbers are already known,
 * and answers with the layout — or with a plain-English error, never silence.
 */

import { OPS } from 'pdfjs-dist';
import type { LayoutRequest, LayoutResponse } from '@shared/types';
import type { Unsubscribe } from '@shared/bridge';
import { acquireDocument, releaseDocument } from '@renderer/components/viewer';
import { engineForDocument } from '@renderer/features/select-copy';
import { DetachedDocuments } from '../detached-raster';
import type { PDFDocumentProxy } from '../pdfjs';
import { extractPageLayout } from './extract-page-layout';
import type { PageLike } from './extract-page-layout';
import { rasterizeImageObject } from './image-raster';
import { rolesOf } from './page-roles';

async function layoutOf(document: PDFDocumentProxy, request: LayoutRequest) {
  const engine = engineForDocument(document, request.docId);
  const classification = await engine.classifyPage(request.page);
  const page = (await document.getPage(request.page)) as unknown as PageLike;
  return extractPageLayout(page, {
    page: request.page,
    ops: OPS as unknown as Readonly<Record<string, number>>,
    roles: rolesOf(classification),
    printedPageNumber: classification.printedPageNumber,
    rasterize: rasterizeImageObject,
  });
}

async function answer(
  request: LayoutRequest,
  getBytes: (docId: string) => Uint8Array | undefined,
  detached: DetachedDocuments
): Promise<LayoutResponse> {
  const bytes = getBytes(request.docId);
  if (bytes === undefined) {
    const layout = await layoutOf(await detached.open(request.docId), request);
    return { requestId: request.requestId, layout };
  }
  const document = await acquireDocument(bytes);
  try {
    return { requestId: request.requestId, layout: await layoutOf(document, request) };
  } finally {
    releaseDocument(bytes);
  }
}

/** Wire the renderer half. Call once at app start; the result unsubscribes. */
export function registerLayoutResponder(
  getBytes: (docId: string) => Uint8Array | undefined
): Unsubscribe {
  const detached = new DetachedDocuments();
  const unsubscribe = window.librarius.layout.onRequest((request) => {
    void answer(request, getBytes, detached)
      .catch((error: unknown) => ({
        requestId: request.requestId,
        layout: null,
        error: error instanceof Error ? error.message : String(error),
      }))
      .then((response) => window.librarius.layout.respond(response));
  });
  return () => {
    unsubscribe();
    void detached.dispose();
  };
}

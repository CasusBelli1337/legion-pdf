/**
 * THE VIEWER CONTRACT. Wave-3 features (stamps, signatures, redaction) build
 * against exactly this — see docs/ARCHITECTURE.md "Viewer overlay API".
 *
 * Every coordinate that crosses this boundary is either a client (viewport CSS
 * pixel) coordinate or a PDF user-space coordinate in points, never anything
 * in between, and the two are always convertible at the current zoom.
 */

import type { ReactNode } from 'react';
import type { PageSize, PdfPoint, PdfRect, TextMatch } from '@shared/types';
import type { Box, ClientPoint } from './page-geometry';

export type { Box, ClientPoint } from './page-geometry';

/** What a per-page overlay is handed on every render. */
export interface PageOverlayContext {
  /** 1-based page number this overlay instance is drawing on. */
  page: number;
  /** The page canvas box in client (viewport) coordinates. */
  rect: Box;
  /** CSS pixels per PDF point at the current zoom. */
  scale: number;
  /** Page size in PDF points. */
  size: PageSize;
  /**
   * A PDF-space rectangle as a CSS box relative to the page — the numbers to
   * feed an absolutely positioned child of the overlay layer.
   */
  toLocalBox(rect: PdfRect): Box;
}

/**
 * An overlay layer: absolutely positioned over one page canvas, rendered once
 * per visible page. Return `null` for pages the feature does not mark.
 */
export type PageOverlayRenderer = (context: PageOverlayContext) => ReactNode;

/** Optional progress hook for `findText` on long documents. */
export type SearchProgress = (pagesSearched: number, pageCount: number) => void;

/** The context value `useViewerApi()` returns. Null when no document is open. */
export interface ViewerApi {
  docId: string;
  pageCount: number;
  /** 1-based page at the top of the viewport. */
  currentPage: number;
  goToPage(page: number): void;
  /** 1 = 100%. Clamped to 0.1–8 by the store. */
  zoom: number;
  setZoom(zoom: number): void;
  /** Viewport coordinates to PDF points. Null when that page is not mounted. */
  clientToPdf(page: number, point: ClientPoint): PdfPoint | null;
  /** PDF points to viewport coordinates. Null when that page is not mounted. */
  pdfToClient(page: number, point: PdfPoint): ClientPoint | null;
  /** Page size in PDF points. Null only before the size has been read. */
  pageSize(page: number): PageSize | null;
  /** Mount a render prop over every page. Returns the unsubscribe function. */
  registerOverlay(id: string, render: PageOverlayRenderer): () => void;
  /** Case-insensitive search of the whole document; quads are in PDF points. */
  findText(query: string, onProgress?: SearchProgress): Promise<TextMatch[]>;
}

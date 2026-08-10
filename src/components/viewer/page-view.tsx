/**
 * One page of the document: the canvas, the selectable text layer, the overlay
 * layer, and a shimmer while it draws so the attorney always sees movement.
 */

import { memo, useRef } from 'react';
import type { PageSize } from '@shared/types';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { OverlayLayer } from './overlay-layer';
import { pageBoxAt } from './page-geometry';
import { usePageRender } from './use-page-render';
import type { ViewerController } from './viewer-controller';
import './text-layer.css';

interface PageViewProps {
  document: PDFDocumentProxy | null;
  page: number;
  size: PageSize;
  zoom: number;
  controller: ViewerController;
}

function PageStatusOverlay({ page, isError }: { page: number; isError: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-armory-elevated">
      {isError ? (
        <p className="readout text-danger">Page {page} could not be drawn</p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="h-1.5 w-24 animate-pulse rounded-full bg-armory-border-strong" />
          <span className="readout text-text-muted">Rendering page {page}</span>
        </div>
      )}
    </div>
  );
}

function PageViewComponent({ document, page, size, zoom, controller }: PageViewProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const status = usePageRender({
    document,
    page,
    zoom,
    controller,
    elementRef,
    canvasRef,
    textRef,
  });
  const box = pageBoxAt(size, zoom);

  return (
    <div className="flex justify-center py-3">
      <div
        ref={elementRef}
        data-page={page}
        // White is the paper, not a theme colour: a page is a page.
        className="relative bg-white shadow-glow-sm outline outline-armory-border"
        style={{ width: `${box.width}px`, height: `${box.height}px` }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        <div ref={textRef} className="textLayer" />
        <OverlayLayer page={page} controller={controller} />
        {status !== 'ready' && <PageStatusOverlay page={page} isError={status === 'error'} />}
      </div>
    </div>
  );
}

export const PageView = memo(PageViewComponent);

/**
 * One page of the document: the double-buffered canvas pair, the selectable
 * text layer, the overlay layer, and a shimmer while the FIRST draw runs.
 *
 * The shimmer is only ever for the first draw. Once a page has a bitmap it
 * keeps it through every redraw — a new zoom, or new bytes after an edit — so
 * the attorney's page never blanks under him (see ./page-canvas).
 */

import { memo, useRef, useState } from 'react';
import type { PageSize } from '@shared/types';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { OverlayLayer } from './overlay-layer';
import { pageBoxAt } from './page-geometry';
import { PageBuffers } from './page-canvas';
import type { PageRoleMap } from './text-layer-roles';
import { usePageRender } from './use-page-render';
import type { ViewerController } from './viewer-controller';
import './text-layer.css';

interface PageViewProps {
  document: PDFDocumentProxy | null;
  page: number;
  size: PageSize;
  zoom: number;
  controller: ViewerController;
  /** Text roles for this page, or null when nothing has classified it. */
  roles: PageRoleMap | null;
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

function PageViewComponent({ document, page, size, zoom, controller, roles }: PageViewProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // Built once per page component and never replaced: which canvas is in front
  // is state the render must not reset.
  const [buffers] = useState(() => new PageBuffers(frontRef, backRef));

  const { status, hasPainted } = usePageRender({
    document,
    page,
    zoom,
    controller,
    elementRef,
    buffers,
    textRef,
    roles,
  });
  const box = pageBoxAt(size, zoom);
  const showOverlay = status === 'error' || (!hasPainted && status !== 'ready');

  return (
    <div className="flex justify-center py-3">
      <div
        ref={elementRef}
        data-page={page}
        // White is the paper, not a theme colour: a page is a page.
        className="relative bg-white shadow-glow-sm outline outline-armory-border"
        style={{ width: `${box.width}px`, height: `${box.height}px` }}
      >
        <canvas ref={frontRef} className="absolute inset-0 block h-full w-full" />
        <canvas ref={backRef} className="absolute inset-0 block h-full w-full opacity-0" />
        <div ref={textRef} className="textLayer" />
        <OverlayLayer page={page} controller={controller} />
        {showOverlay && <PageStatusOverlay page={page} isError={status === 'error'} />}
      </div>
    </div>
  );
}

export const PageView = memo(PageViewComponent);

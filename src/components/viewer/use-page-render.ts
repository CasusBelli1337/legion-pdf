/**
 * Draws one page: canvas first (so something appears fast), then the pdfjs text
 * layer on top so text stays selectable and copyable. Registers the page's
 * geometry with the controller — this is where ViewerApi's coordinate answers
 * come from — and tears both down when the page scrolls out or the zoom changes.
 */

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { RenderTask } from 'pdfjs-dist';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { toTransformMatrix } from './page-geometry';
import type { ViewerController } from './viewer-controller';

export type PageRenderStatus = 'rendering' | 'ready' | 'error';

/** Cancelled renders and torn-down workers are routine, not failures to report. */
function isRoutineCancellation(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  return (
    name === 'RenderingCancelledException' ||
    name === 'AbortException' ||
    message.includes('Worker was destroyed') ||
    message.includes('Transport destroyed')
  );
}

export interface PageRenderOptions {
  document: PDFDocumentProxy | null;
  page: number;
  zoom: number;
  controller: ViewerController;
  elementRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  textRef: RefObject<HTMLDivElement | null>;
}

interface Drawing {
  cancelled: boolean;
  task: RenderTask | null;
  text: TextLayer | null;
}

async function drawCanvas(
  options: PageRenderOptions,
  drawing: Drawing
): Promise<{ viewport: ReturnType<PageProxy['getViewport']>; page: PageProxy } | null> {
  const { document, page, zoom, canvasRef } = options;
  if (document === null) return null;
  const pdfPage = await document.getPage(page);
  const canvas = canvasRef.current;
  if (drawing.cancelled || canvas === null) return null;

  const viewport = pdfPage.getViewport({ scale: zoom });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(viewport.width * ratio);
  canvas.height = Math.ceil(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  drawing.task = pdfPage.render({
    canvas,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
  });
  await drawing.task.promise;
  return drawing.cancelled ? null : { viewport, page: pdfPage };
}

type PageProxy = Awaited<ReturnType<PDFDocumentProxy['getPage']>>;

async function drawTextLayer(
  options: PageRenderOptions,
  drawing: Drawing,
  pdfPage: PageProxy,
  viewport: ReturnType<PageProxy['getViewport']>
): Promise<void> {
  const container = options.textRef.current;
  if (container === null) return;
  const source = await pdfPage.getTextContent();
  if (drawing.cancelled) return;
  container.replaceChildren();
  container.style.setProperty('--total-scale-factor', String(options.zoom));
  drawing.text = new TextLayer({ textContentSource: source, container, viewport });
  await drawing.text.render();
}

/** What has been drawn, and for which document/page/zoom — so a zoom change re-shimmers. */
interface DrawnState {
  key: string;
  status: PageRenderStatus;
}

export function usePageRender(options: PageRenderOptions): PageRenderStatus {
  const { controller, document, elementRef, page, zoom } = options;
  const [drawn, setDrawn] = useState<DrawnState>({ key: '', status: 'rendering' });
  // A re-draw of the same page at the same zoom (new bytes) keeps the old canvas
  // on screen rather than flashing a shimmer; the canvas is repainted in place.
  const key = `${page}:${zoom}`;
  const setStatus = (status: PageRenderStatus): void => setDrawn({ key, status });

  useEffect(() => {
    if (document === null) return;
    const drawing: Drawing = { cancelled: false, task: null, text: null };

    async function run(): Promise<void> {
      const drawn = await drawCanvas(options, drawing);
      if (drawn === null || drawing.cancelled) return;
      const { viewport } = drawn;
      controller.setGeometry(page, {
        size: { width: viewport.width / zoom, height: viewport.height / zoom },
        scale: zoom,
        transform: toTransformMatrix(viewport.transform),
        element: elementRef.current,
      });
      setStatus('ready');
      await drawTextLayer(options, drawing, drawn.page, viewport);
    }

    void run().catch((error: unknown) => {
      if (drawing.cancelled || isRoutineCancellation(error)) return;
      console.error(`Page ${page} could not be drawn.`, error);
      setStatus('error');
    });

    return () => {
      drawing.cancelled = true;
      drawing.task?.cancel();
      drawing.text?.cancel();
      controller.clearGeometry(page);
    };
    // The refs are stable for the life of one page component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, document, page, zoom]);

  return drawn.key === key ? drawn.status : 'rendering';
}

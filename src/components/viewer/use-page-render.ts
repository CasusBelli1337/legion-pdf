/**
 * Draws one page: canvas first (so something appears fast), then the pdfjs text
 * layer on top so text stays selectable and copyable. Registers the page's
 * geometry with the controller — this is where ViewerApi's coordinate answers
 * come from — and tears both down when the page scrolls out or the zoom changes.
 *
 * Two rules earn their keep here:
 *
 * 1. THE NEW BITMAP NEVER REPLACES THE OLD ONE UNTIL IT IS FINISHED. Rendering
 *    goes into the page's back canvas and is presented in one step (see
 *    ./page-canvas), so committing a text box or a stamp repaints the page
 *    without the half-second of dark it used to flash.
 * 2. A DRAW NEVER ENDS QUIETLY. A cancelled render on a page that is going away
 *    is routine; the SAME rejection on a page that is still on screen means the
 *    document was pulled out from under it, and swallowing that is what left
 *    the viewer sitting on "Rendering page 1" for ever. If nothing has been
 *    painted, the page says so.
 */

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { RenderTask } from 'pdfjs-dist';
import { AnnotationMode } from '../../lib/pdfjs';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { drawAnnotationLayer } from './annotation-layer-draw';
import { toTransformMatrix } from './page-geometry';
import type { PageBuffers } from './page-canvas';
import { applyTextRoles, tagTextSpans, type PageRoleMap } from './text-layer-roles';
import type { ViewerController } from './viewer-controller';

export type PageRenderStatus = 'rendering' | 'ready' | 'error';

export interface PageRenderState {
  status: PageRenderStatus;
  /** False until the first frame is on screen — the shimmer is only for that. */
  hasPainted: boolean;
}

/** Cancelled renders and torn-down workers are routine only while tearing down. */
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
  /** The doc-store id behind `document` — the form lane keys its edits by it. */
  docId: string;
  page: number;
  zoom: number;
  controller: ViewerController;
  elementRef: RefObject<HTMLDivElement | null>;
  buffers: PageBuffers;
  textRef: RefObject<HTMLDivElement | null>;
  annotationRef: RefObject<HTMLDivElement | null>;
  /** Text roles for this page, when the selection lane has classified it. */
  roles: PageRoleMap | null;
}

interface Drawing {
  cancelled: boolean;
  painted: boolean;
  task: RenderTask | null;
  text: TextLayer | null;
  /** Widget appearance canvases the page render emits for the form layer. */
  canvasMap: Map<string, HTMLCanvasElement>;
}

type PageProxy = Awaited<ReturnType<PDFDocumentProxy['getPage']>>;
type PageViewport = ReturnType<PageProxy['getViewport']>;

async function drawCanvas(
  options: PageRenderOptions,
  drawing: Drawing
): Promise<{ viewport: PageViewport; page: PageProxy } | null> {
  const { document, page, zoom, buffers } = options;
  if (document === null) return null;
  // A page the document in hand does not have YET. Inserting pages raises the
  // tab's page count before the new bytes have finished loading, and asking the
  // outgoing document for page 41 of 40 throws. It is not an error — the
  // replacement will redraw this page in a moment — so it must not paint one.
  if (page > document.numPages) return null;
  const pdfPage = await document.getPage(page);
  const canvas = buffers.back();
  if (drawing.cancelled || canvas === null) return null;

  const viewport = pdfPage.getViewport({ scale: zoom });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(viewport.width * ratio);
  canvas.height = Math.ceil(viewport.height * ratio);

  // ENABLE_FORMS leaves form-widget appearances off the bitmap — the HTML
  // annotation layer is their single painter — and fills canvasMap with the
  // checkbox/radio state appearances that layer places.
  drawing.task = pdfPage.render({
    canvas,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    annotationMode: AnnotationMode.ENABLE_FORMS,
    annotationCanvasMap: drawing.canvasMap,
  });
  await drawing.task.promise;
  if (drawing.cancelled) return null;
  // The one moment the page changes: a complete bitmap replaces a complete one.
  if (!buffers.present()) return null;
  drawing.painted = true;
  return { viewport, page: pdfPage };
}

async function drawTextLayer(
  options: PageRenderOptions,
  drawing: Drawing,
  pdfPage: PageProxy,
  viewport: PageViewport
): Promise<void> {
  const container = options.textRef.current;
  if (container === null) return;
  const source = await pdfPage.getTextContent();
  if (drawing.cancelled) return;
  container.replaceChildren();
  container.style.setProperty('--total-scale-factor', String(options.zoom));
  drawing.text = new TextLayer({ textContentSource: source, container, viewport });
  await drawing.text.render();
  if (drawing.cancelled) return;
  tagTextSpans(drawing.text.textDivs, source.items, options.page);
  applyTextRoles(container, options.roles);
}

/** Form widgets go on last — they sit above the text layer and need its zoom. */
async function drawFormWidgets(
  options: PageRenderOptions,
  drawing: Drawing,
  pdfPage: PageProxy,
  viewport: PageViewport
): Promise<void> {
  const container = options.annotationRef.current;
  if (container === null || options.document === null || drawing.cancelled) return;
  await drawAnnotationLayer({
    container,
    document: options.document,
    docId: options.docId,
    pdfPage,
    viewport,
    zoom: options.zoom,
    canvasMap: drawing.canvasMap,
  });
}

/** What has been drawn, and for which page/zoom — so a zoom change re-draws. */
interface DrawnState {
  key: string;
  status: PageRenderStatus;
  painted: boolean;
}

const NOTHING_DRAWN: DrawnState = { key: '', status: 'rendering', painted: false };

export function usePageRender(options: PageRenderOptions): PageRenderState {
  const { controller, document, elementRef, page, roles, textRef, zoom } = options;
  const [drawn, setDrawn] = useState<DrawnState>(NOTHING_DRAWN);
  const key = `${page}:${zoom}`;

  useEffect(() => {
    if (document === null) return;
    const drawing: Drawing = {
      cancelled: false,
      painted: false,
      task: null,
      text: null,
      canvasMap: new Map(),
    };
    const settle = (status: PageRenderStatus): void =>
      setDrawn((current) => ({ key, status, painted: current.painted || drawing.painted }));

    async function run(): Promise<void> {
      const result = await drawCanvas(options, drawing);
      if (result === null || drawing.cancelled) return;
      const { viewport } = result;
      controller.setGeometry(page, {
        size: { width: viewport.width / zoom, height: viewport.height / zoom },
        scale: zoom,
        transform: toTransformMatrix(viewport.transform),
        element: elementRef.current,
      });
      settle('ready');
      await drawTextLayer(options, drawing, result.page, viewport);
      await drawFormWidgets(options, drawing, result.page, viewport);
    }

    void run().catch((error: unknown) => {
      if (drawing.cancelled) return;
      if (!isRoutineCancellation(error)) console.error(`Page ${page} could not be drawn.`, error);
      // A page that never got a bitmap must say so rather than shimmer for ever.
      if (!drawing.painted) settle('error');
    });

    return () => {
      drawing.cancelled = true;
      drawing.task?.cancel();
      drawing.text?.cancel();
      controller.clearGeometry(page);
    };
    // The refs and the buffers are stable for the life of one page component;
    // `roles` is re-applied by the effect below when it lands after the draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, document, page, zoom]);

  // A classification that arrives after the text layer is already on screen.
  useEffect(() => applyTextRoles(textRef.current, roles), [roles, textRef, drawn.painted]);

  return {
    status: drawn.key === key ? drawn.status : 'rendering',
    hasPainted: drawn.painted,
  };
}

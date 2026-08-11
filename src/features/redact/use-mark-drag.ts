/**
 * Pointer work for marking: drag to draw, drag to move, drag a corner to
 * resize. Every screen coordinate is converted through the viewer's own
 * `clientToPdf`, so a rotated page needs no special case here — the transform
 * already knows which way the page is turned.
 *
 * The pointer is clamped to the page box before conversion, so a drag that runs
 * off the edge of the page produces a mark that stops at the edge rather than
 * one hanging in space that the engine would refuse.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PdfPoint, PdfRect, RedactionBox } from '@shared/types';
import type { Box, ViewerApi } from '@renderer/components/viewer';
import { isDrawable, moveRect, rectFromCorners, resizeRect } from './mark-geometry';
import type { ResizeHandle } from './mark-geometry';

export interface MarkPreview {
  page: number;
  rect: PdfRect;
}

interface DrawDrag {
  mode: 'draw';
  page: number;
  pageRect: Box;
  origin: PdfPoint;
}

interface EditDrag {
  mode: 'move' | 'resize';
  page: number;
  pageRect: Box;
  origin: PdfPoint;
  id: string;
  rect: PdfRect;
  handle: ResizeHandle;
}

type Drag = DrawDrag | EditDrag;

export interface MarkDragActions {
  addMark(page: number, rect: PdfRect): void;
  updateMark(id: string, rect: PdfRect): void;
  selectMark(id: string | null): void;
}

export interface MarkDrag {
  preview: MarkPreview | null;
  beginDraw(page: number, pageRect: Box, event: ReactPointerEvent): void;
  beginMove(mark: RedactionBox, pageRect: Box, event: ReactPointerEvent): void;
  beginResize(
    mark: RedactionBox,
    handle: ResizeHandle,
    pageRect: Box,
    event: ReactPointerEvent
  ): void;
}

function clampToPage(event: { clientX: number; clientY: number }, rect: Box): PdfPoint {
  return {
    x: Math.min(Math.max(event.clientX, rect.left), rect.left + rect.width),
    y: Math.min(Math.max(event.clientY, rect.top), rect.top + rect.height),
  };
}

function rectFor(drag: Drag, point: PdfPoint): PdfRect {
  if (drag.mode === 'draw') return rectFromCorners(drag.origin, point);
  if (drag.mode === 'resize') return resizeRect(drag.rect, drag.handle, point);
  return moveRect(drag.rect, point.x - drag.origin.x, point.y - drag.origin.y);
}

interface DragSession {
  drag: Drag | null;
  latest: { current: PdfRect | null };
  setDrag(drag: Drag | null): void;
  setPreview(preview: MarkPreview | null): void;
}

/** The pointer is tracked on the WINDOW so a drag survives leaving the page. */
function useWindowDrag(api: ViewerApi | null, session: DragSession, actions: MarkDragActions) {
  const { drag, latest, setDrag, setPreview } = session;
  useEffect(() => {
    if (drag === null || api === null) return;

    const onMove = (event: PointerEvent): void => {
      const point = api.clientToPdf(drag.page, clampToPage(event, drag.pageRect));
      if (point === null) return;
      latest.current = rectFor(drag, point);
      setPreview({ page: drag.page, rect: latest.current });
    };

    const onUp = (): void => {
      const rect = latest.current;
      setDrag(null);
      setPreview(null);
      latest.current = null;
      if (rect === null || !isDrawable(rect)) return;
      if (drag.mode === 'draw') actions.addMark(drag.page, rect);
      else actions.updateMark(drag.id, rect);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [actions, api, drag, latest, setDrag, setPreview]);
}

type StartDrag = (drag: Drag, event: ReactPointerEvent) => void;

/** The three ways a drag begins. One shape each; the state machine is shared. */
function useDragStarters(
  api: ViewerApi | null,
  actions: MarkDragActions,
  start: StartDrag
): Omit<MarkDrag, 'preview'> {
  const originAt = useCallback(
    (page: number, pageRect: Box, event: ReactPointerEvent): PdfPoint | null =>
      api?.clientToPdf(page, clampToPage(event, pageRect)) ?? null,
    [api]
  );

  const beginDraw = useCallback(
    (page: number, pageRect: Box, event: ReactPointerEvent): void => {
      const origin = originAt(page, pageRect, event);
      if (origin === null) return;
      actions.selectMark(null);
      start({ mode: 'draw', page, pageRect, origin }, event);
    },
    [actions, originAt, start]
  );

  const beginEdit = useCallback(
    (
      mode: 'move' | 'resize',
      mark: RedactionBox,
      handle: ResizeHandle,
      pageRect: Box,
      event: ReactPointerEvent
    ): void => {
      const origin = originAt(mark.page, pageRect, event);
      if (origin === null) return;
      actions.selectMark(mark.id);
      const { page, id, rect } = mark;
      start({ mode, page, pageRect, origin, id, rect, handle }, event);
    },
    [actions, originAt, start]
  );

  return {
    beginDraw,
    beginMove: (mark, pageRect, event) => beginEdit('move', mark, 'se', pageRect, event),
    beginResize: (mark, handle, pageRect, event) =>
      beginEdit('resize', mark, handle, pageRect, event),
  };
}

/** Drag state machine. Returns the live preview plus the three drag starters. */
export function useMarkDrag(api: ViewerApi | null, actions: MarkDragActions): MarkDrag {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<MarkPreview | null>(null);
  const latest = useRef<PdfRect | null>(null);

  useWindowDrag(api, { drag, latest, setDrag, setPreview }, actions);

  const start = useCallback<StartDrag>((next, event): void => {
    event.preventDefault();
    event.stopPropagation();
    latest.current = next.mode === 'draw' ? null : next.rect;
    setDrag(next);
  }, []);

  return { preview, ...useDragStarters(api, actions, start) };
}

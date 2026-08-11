/**
 * Pointing at the page: click-to-place for text and exhibit stamps, drag-a-box
 * for whiteout.
 *
 * Two viewer rules shape this. `clientToPdf` returns null while a page is
 * between renders, so every reading is taken fresh and a null is simply
 * ignored rather than assumed. And registering an overlay does not re-render
 * the pages, so the renderer is rebuilt (and re-registered) on every change to
 * the drag — that is what makes the box follow the mouse.
 */

import { useCallback, useState } from 'react';
import type { PdfPoint, PdfRect } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';

export type PlacementMode = 'off' | 'point' | 'rect';

export interface PlacedPoint {
  page: number;
  at: PdfPoint;
}

export interface PlacedRect {
  page: number;
  rect: PdfRect;
}

/** A drag in progress: both corners in PDF user space. */
export interface DragState {
  page: number;
  from: PdfPoint;
  to: PdfPoint;
}

export interface Placement {
  point: PlacedPoint | null;
  rect: PlacedRect | null;
  drag: DragState | null;
  begin(page: number, at: PdfPoint): void;
  move(page: number, at: PdfPoint): void;
  end(): void;
  clear(): void;
}

/** The axis-aligned rectangle between two dragged corners. */
export function rectBetween(from: PdfPoint, to: PdfPoint): PdfRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/** A box small enough to be a stray click, not an intentional drag. */
const MINIMUM_DRAG = 2;

export function usePlacement(mode: PlacementMode): Placement {
  const [point, setPoint] = useState<PlacedPoint | null>(null);
  const [rect, setRect] = useState<PlacedRect | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const begin = useCallback(
    (page: number, at: PdfPoint) => {
      if (mode === 'point') {
        setPoint({ page, at });
        return;
      }
      if (mode === 'rect') {
        setRect(null);
        setDrag({ page, from: at, to: at });
      }
    },
    [mode]
  );

  const move = useCallback((page: number, at: PdfPoint) => {
    setDrag((current) =>
      current === null || current.page !== page ? current : { ...current, to: at }
    );
  }, []);

  const end = useCallback(() => {
    setDrag((current) => {
      if (current !== null) {
        const box = rectBetween(current.from, current.to);
        if (box.width > MINIMUM_DRAG && box.height > MINIMUM_DRAG) {
          setRect({ page: current.page, rect: box });
        }
      }
      return null;
    });
  }, []);

  const clear = useCallback(() => {
    setPoint(null);
    setRect(null);
    setDrag(null);
  }, []);

  return { point, rect, drag, begin, move, end, clear };
}

/** Reads a pointer event as a PDF point, or null while the page is unmounted. */
export function pdfPointOf(
  api: ViewerApi | null,
  page: number,
  event: { clientX: number; clientY: number }
): PdfPoint | null {
  if (api === null) return null;
  return api.clientToPdf(page, { x: event.clientX, y: event.clientY });
}

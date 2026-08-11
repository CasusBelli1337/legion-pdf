/**
 * Moving and resizing a placed signature with the pointer.
 *
 * Every reading is taken in CLIENT pixels while the pointer is down and only
 * converted back to PDF points through the viewer, which is what keeps dragging
 * correct on a page carrying a /Rotate flag: "right and up" on the screen is
 * right and up whatever the page thinks its orientation is.
 *
 * Resizing is by height alone — the width follows the image's aspect ratio in
 * the store — so a signature can be made bigger or smaller but never stretched
 * into a shape the attorney never signed.
 */

import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PdfPoint } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
import { usePlacementStore, type LivePlacement } from './placement-store';

type GrabKind = 'move' | 'resize';

interface Grab {
  id: string;
  kind: GrabKind;
  page: number;
  /** The bottom-left corner, which a resize leaves exactly where it is. */
  at: PdfPoint;
  /** Pointer offset from that anchor at grab time, in client pixels. */
  dx: number;
  dy: number;
}

export interface PlacementDrag {
  start(placement: LivePlacement, kind: GrabKind): (event: ReactPointerEvent<HTMLElement>) => void;
  move(event: ReactPointerEvent<HTMLElement>): void;
  end(event: ReactPointerEvent<HTMLElement>): void;
}

export function usePlacementDrag(api: ViewerApi | null, scale: number): PlacementDrag {
  const grab = useRef<Grab | null>(null);
  const moveTo = usePlacementStore((state) => state.moveTo);
  const resizeTo = usePlacementStore((state) => state.resizeTo);
  const select = usePlacementStore((state) => state.select);

  const start = useCallback(
    (placement: LivePlacement, kind: GrabKind) =>
      (event: ReactPointerEvent<HTMLElement>): void => {
        event.stopPropagation();
        select(placement.id);
        const anchor = api?.pdfToClient(placement.page, placement.at) ?? null;
        if (anchor === null) return;
        grab.current = {
          id: placement.id,
          kind,
          page: placement.page,
          at: placement.at,
          dx: event.clientX - anchor.x,
          dy: event.clientY - anchor.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
    [api, select]
  );

  const move = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const held = grab.current;
      if (held === null || api === null) return;
      if (held.kind === 'move') {
        const at = api.clientToPdf(held.page, {
          x: event.clientX - held.dx,
          y: event.clientY - held.dy,
        });
        if (at !== null) moveTo(held.id, at);
        return;
      }
      // The handle sits at the top of the box and the anchor is its bottom-left,
      // so the gap between them IS the height — read on screen, converted once.
      const anchor = api.pdfToClient(held.page, held.at);
      if (anchor !== null) resizeTo(held.id, (anchor.y - event.clientY) / scale);
    },
    [api, moveTo, resizeTo, scale]
  );

  const end = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
    grab.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return { start, move, end };
}

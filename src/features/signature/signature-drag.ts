/**
 * Dragging a signature out of the library and onto the page.
 *
 * Pointer events, not HTML5 drag-and-drop: the pages are canvases inside a
 * virtualised scroller, and the native drag image cannot be styled or dropped
 * on a canvas reliably. Holding pointer capture on the library tile means the
 * whole gesture is one element's business, and the drop point is read back
 * through the viewer's own geometry so a rotated page still lands correctly.
 *
 * A press that never moves is still a CLICK — the tile arms the signature for
 * click-to-place, exactly as before — so neither habit is taken away.
 */

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PdfPoint, SignatureAsset } from '@shared/types';
import type { ClientPoint, ViewerApi } from '@renderer/components/viewer';

/** Movement that turns a press into a drag rather than a click, in pixels. */
const DRAG_THRESHOLD = 4;

export interface DragGhost {
  signature: SignatureAsset;
  /** Pointer position in viewport pixels — where the ghost is drawn. */
  x: number;
  y: number;
}

/** Where a drop landed: a 1-based page and the point in PDF user space. */
export interface DropTarget {
  page: number;
  at: PdfPoint;
}

interface PageBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One page's box in viewport pixels, or null while that page is unmounted. */
function pageBoxOf(api: ViewerApi, page: number): PageBox | null {
  const size = api.pageSize(page);
  if (size === null) return null;
  const first = api.pdfToClient(page, { x: 0, y: 0 });
  const second = api.pdfToClient(page, { x: size.width, y: size.height });
  if (first === null || second === null) return null;
  return {
    left: Math.min(first.x, second.x),
    right: Math.max(first.x, second.x),
    top: Math.min(first.y, second.y),
    bottom: Math.max(first.y, second.y),
  };
}

function contains(box: PageBox, point: ClientPoint): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

/**
 * The page under a viewport point, and that point in PDF space. Only pages the
 * viewer currently has mounted can answer, which is exactly the set the
 * attorney can see and therefore the only set they can drop onto.
 */
export function pageAtClientPoint(api: ViewerApi | null, point: ClientPoint): DropTarget | null {
  if (api === null) return null;
  for (let page = 1; page <= api.pageCount; page += 1) {
    const box = pageBoxOf(api, page);
    if (box === null || !contains(box, point)) continue;
    const at = api.clientToPdf(page, point);
    if (at !== null) return { page, at };
  }
  return null;
}

export interface SignatureDrag {
  ghost: DragGhost | null;
  /** Pointer handlers for one library tile. */
  handlers(signature: SignatureAsset): {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
    onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
  };
}

interface Press {
  signature: SignatureAsset;
  startX: number;
  startY: number;
  dragging: boolean;
}

function movedFar(press: Press, event: ReactPointerEvent<HTMLElement>): boolean {
  return (
    Math.abs(event.clientX - press.startX) > DRAG_THRESHOLD ||
    Math.abs(event.clientY - press.startY) > DRAG_THRESHOLD
  );
}

function release(event: ReactPointerEvent<HTMLElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

/**
 * @param onDrop  the gesture ended over a page
 * @param onClick the gesture never became a drag
 */
export function useSignatureDrag(
  onDrop: (signature: SignatureAsset, point: ClientPoint) => void,
  onClick: (signature: SignatureAsset) => void
): SignatureDrag {
  const press = useRef<Press | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);

  const move = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const held = press.current;
    if (held === null) return;
    if (!held.dragging && !movedFar(held, event)) return;
    held.dragging = true;
    setGhost({ signature: held.signature, x: event.clientX, y: event.clientY });
  }, []);

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const held = press.current;
      press.current = null;
      setGhost(null);
      release(event);
      if (held === null) return;
      if (held.dragging) onDrop(held.signature, { x: event.clientX, y: event.clientY });
      else onClick(held.signature);
    },
    [onClick, onDrop]
  );

  const cancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    press.current = null;
    setGhost(null);
    release(event);
  }, []);

  const handlers = useCallback(
    (signature: SignatureAsset) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>): void => {
        press.current = {
          signature,
          startX: event.clientX,
          startY: event.clientY,
          dragging: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: move,
      onPointerUp: finish,
      onPointerCancel: cancel,
    }),
    [cancel, finish, move]
  );

  return { ghost, handlers };
}

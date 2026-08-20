/**
 * The drag behind a panel splitter. Pointer capture so the drag survives the
 * pointer leaving the handle, the width written to localStorage as it settles,
 * and arrow keys for anyone not using a mouse.
 */

import { useCallback, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  clampWidth,
  readWidth,
  widthFromDrag,
  writeWidth,
  type GrowDirection,
  type PanelSize,
} from './panel-size';

const KEY_STEP = 16;

export interface PanelWidth {
  width: number;
  isDragging: boolean;
  /** Props for the splitter element itself. */
  onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
  onDoubleClick(): void;
  onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void;
  min: number;
  max: number;
}

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

interface DragHandlers {
  /** Live width as the pointer moves; not written to storage until it stops. */
  onDrag(width: number): void;
  onSettle(width: number): void;
}

/**
 * Pointer capture on the handle itself, so the drag follows the pointer off
 * the four-pixel line and keeps going over the document and the panel alike.
 */
function beginDrag(
  event: ReactPointerEvent<HTMLElement>,
  measure: (clientX: number) => number,
  handlers: DragHandlers
): void {
  event.preventDefault();
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);

  const onMove = (move: PointerEvent): void => handlers.onDrag(measure(move.clientX));
  const onUp = (up: PointerEvent): void => {
    handle.releasePointerCapture(up.pointerId);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    handlers.onSettle(measure(up.clientX));
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}

export function usePanelWidth(size: PanelSize, grow: GrowDirection): PanelWidth {
  // Read once, during the first render: the saved width is on screen in the
  // first frame rather than snapping into place after an effect.
  const [width, setWidth] = useState(() => readWidth(size, storage()));
  const [isDragging, setDragging] = useState(false);

  const apply = useCallback(
    (next: number) => {
      setWidth(next);
      writeWidth(size, storage(), next);
    },
    [size]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const from = { x: event.clientX, width };
      const measure = (clientX: number): number =>
        widthFromDrag(size, grow, from.width, clientX - from.x);
      setDragging(true);
      beginDrag(event, measure, {
        onDrag: setWidth,
        onSettle: (settled) => {
          setDragging(false);
          apply(settled);
        },
      });
    },
    [apply, grow, size, width]
  );

  const onDoubleClick = useCallback(() => apply(size.preferred), [apply, size]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const step =
        event.key === 'ArrowLeft' ? -KEY_STEP : event.key === 'ArrowRight' ? KEY_STEP : 0;
      if (step === 0) return;
      event.preventDefault();
      apply(clampWidth(size, width + (grow === 'left' ? -step : step)));
    },
    [apply, grow, size, width]
  );

  return {
    width,
    isDragging,
    onPointerDown,
    onDoubleClick,
    onKeyDown,
    min: size.min,
    max: size.max,
  };
}

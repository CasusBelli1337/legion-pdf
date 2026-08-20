/**
 * Keeping a pop-up menu inside the window. Pure, so the edge cases are tested
 * rather than discovered by an attorney right-clicking near the taskbar.
 */

export interface MenuBox {
  width: number;
  height: number;
}

export interface MenuViewport {
  width: number;
  height: number;
}

export interface MenuPosition {
  left: number;
  top: number;
}

const EDGE = 8;

/**
 * Where a menu opened at (x, y) actually goes. It prefers down-and-right of the
 * pointer, flips to the other side when that would run off the window, and
 * never sits closer than a few pixels to any edge.
 */
export function menuPosition(
  point: { x: number; y: number },
  box: MenuBox,
  viewport: MenuViewport
): MenuPosition {
  const left = point.x + box.width + EDGE > viewport.width ? point.x - box.width : point.x;
  const top = point.y + box.height + EDGE > viewport.height ? point.y - box.height : point.y;
  return {
    left: Math.max(EDGE, Math.min(left, Math.max(EDGE, viewport.width - box.width - EDGE))),
    top: Math.max(EDGE, Math.min(top, Math.max(EDGE, viewport.height - box.height - EDGE))),
  };
}

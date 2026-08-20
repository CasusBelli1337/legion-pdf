/**
 * Where a selection menu hangs: the END of what the attorney selected.
 *
 * A drag that finishes at the bottom-right of the last line should put the menu
 * under that corner, not under wherever the drag started, and a right-click
 * inside an existing selection should use the pointer instead. Kept pure so the
 * arithmetic is tested without a DOM.
 */

/** The bits of a DOMRect this needs. */
export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AnchorPoint {
  x: number;
  y: number;
}

/** A rect the browser reports for a collapsed or empty range is not a rect. */
function isRealRect(rect: RectLike): boolean {
  return rect.width > 0 || rect.height > 0;
}

/**
 * The bottom-right corner of the last real rectangle the selection covers,
 * falling back to the pointer when the selection reports nothing usable.
 */
export function anchorFromRects(rects: readonly RectLike[], fallback: AnchorPoint): AnchorPoint {
  const last = [...rects].reverse().find(isRealRect);
  if (last === undefined) return fallback;
  return { x: last.right, y: last.bottom };
}

/** True when a selection has something in it that a menu could act on. */
export function hasSelectedText(selection: Selection | null): boolean {
  return selection !== null && !selection.isCollapsed && selection.toString().trim() !== '';
}

/** Rectangles of the selection's LAST range, in client coordinates. */
export function rectsOfSelectionEnd(selection: Selection): RectLike[] {
  if (selection.rangeCount === 0) return [];
  return [...selection.getRangeAt(selection.rangeCount - 1).getClientRects()];
}

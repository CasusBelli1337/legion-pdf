/**
 * Selection and drop arithmetic for the page rail.
 *
 * The rail's plain click is NOT the Organize grid's: clicking a thumbnail here
 * also takes the viewer to that page, so it must always leave that page
 * selected. Organize's `toggleSelection` drops a page clicked a second time,
 * which is right for a grid of tiles and wrong for a navigation rail — so only
 * that one rule is restated here. Add, extend, and the reorder permutation stay
 * Organize's arithmetic, imported rather than re-derived.
 */

import {
  extendSelection,
  toggleSelection,
  type PageSelection,
} from '../../features/organize/selection';

/** Which modifier keys were held: Ctrl/Cmd adds or removes one, Shift extends. */
export interface RailGesture {
  additive: boolean;
  extend: boolean;
}

/** What a click on `page` leaves selected. `anchor` is the last plain click. */
export function railSelect(
  selection: PageSelection,
  page: number,
  gesture: RailGesture,
  anchor: number | null
): Set<number> {
  if (gesture.extend && anchor !== null) return extendSelection(selection, anchor, page);
  if (gesture.additive) return toggleSelection(selection, page, true);
  return new Set([page]);
}

/**
 * Explorer's rule for a right-click: a page already in the selection leaves the
 * selection alone, so the menu can act on all of them; right-clicking anywhere
 * else makes that page the whole selection before the menu opens.
 */
export function selectionForMenu(selection: PageSelection, page: number): Set<number> {
  return selection.has(page) ? new Set(selection) : new Set([page]);
}

/**
 * Which gap a drop over a thumbnail means. The rail is a vertical strip, so the
 * top half of a page inserts before it and the bottom half after it — the drop
 * line then appears where the pointer actually is instead of always above.
 */
export function dropBeforePage(page: number, offsetY: number, height: number): number {
  if (height <= 0) return page;
  return offsetY * 2 >= height ? page + 1 : page;
}

/**
 * The selection after the document changed length. Deleting pages renumbers
 * everything behind them, so a stale page number must never survive into the
 * next operation — an op against a page that no longer exists is a loud error
 * the attorney did nothing to earn.
 */
export function pagesWithin(selection: PageSelection, pageCount: number): Set<number> {
  return new Set([...selection].filter((page) => page >= 1 && page <= pageCount));
}

/**
 * What a keystroke in the rail means. Delete and Backspace both remove, because
 * attorneys reach for either; Escape drops the selection, which is the way out
 * of a gesture that selected the wrong pages.
 */
export function railKeyAction(key: string): 'delete' | 'clear' | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete';
  if (key === 'Escape') return 'clear';
  return null;
}

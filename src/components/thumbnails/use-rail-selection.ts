/**
 * Selection and drag bookkeeping for the page rail. The arithmetic lives in
 * rail-selection.ts and the Organize lane's selection.ts; this hook only
 * decides which gesture means what and remembers what a drag is carrying.
 *
 * The rail opens with nothing selected on purpose: it is a navigation strip
 * first, and an attorney who has selected nothing must not be one Delete
 * keystroke away from losing a page.
 */

import { useCallback, useRef, useState } from 'react';
import {
  orderedSelection,
  selectAllPages,
  type PageSelection,
} from '../../features/organize/selection';
import { pagesWithin, railSelect, selectionForMenu } from './rail-selection';

export interface RailSelection {
  selection: PageSelection;
  /** Selected pages in document order — the shape every operation wants. */
  selected: number[];
  select(page: number, event: React.MouseEvent): void;
  /** Right-click: keep a selection containing the page, otherwise replace it. */
  focusForMenu(page: number): void;
  selectAll(): void;
  clear(): void;
  /** Remembers what a drag carries: the selection, or the page grabbed. */
  beginDrag(page: number): void;
  dragging(): PageSelection;
  /** After a reorder, follow the moved pages to where they landed. */
  followOrder(order: readonly number[], moved: PageSelection): void;
}

/**
 * What a drag is carrying, held in a ref because the drop lands in a later
 * event. Grabbing a page outside the selection drags that page alone, the way
 * Explorer does — otherwise the drop moves pages the attorney cannot see.
 */
function useDragPayload(selection: PageSelection, selectOnly: (page: number) => void) {
  const drag = useRef<PageSelection>(new Set<number>());

  const begin = useCallback(
    (page: number): void => {
      if (selection.has(page)) {
        drag.current = selection;
        return;
      }
      drag.current = new Set([page]);
      selectOnly(page);
    },
    [selection, selectOnly]
  );

  return { begin, current: () => drag.current };
}

export function useRailSelection(pageCount: number): RailSelection {
  const [stored, setSelection] = useState<PageSelection>(() => new Set<number>());
  const anchor = useRef<number | null>(null);
  // Derived, never stored: a delete renumbers the document under the selection,
  // and a page that no longer exists must not reach an operation. An undo that
  // brings those pages back brings their highlight back with them.
  const selection = pagesWithin(stored, pageCount);

  const selectOnly = useCallback((page: number): void => {
    anchor.current = page;
    setSelection(new Set([page]));
  }, []);

  const drag = useDragPayload(selection, selectOnly);

  const select = useCallback((page: number, event: React.MouseEvent): void => {
    const from = anchor.current;
    const gesture = { additive: event.ctrlKey || event.metaKey, extend: event.shiftKey };
    if (!gesture.extend) anchor.current = page;
    setSelection((current) => railSelect(current, page, gesture, from));
  }, []);

  const focusForMenu = useCallback((page: number): void => {
    anchor.current = page;
    setSelection((current) => selectionForMenu(current, page));
  }, []);

  const selectAll = useCallback((): void => {
    anchor.current = 1;
    setSelection(selectAllPages(pageCount));
  }, [pageCount]);

  const clear = useCallback((): void => {
    anchor.current = null;
    setSelection(new Set<number>());
  }, []);

  const followOrder = useCallback((order: readonly number[], moved: PageSelection): void => {
    const landed = new Set<number>();
    order.forEach((page, index) => {
      if (moved.has(page)) landed.add(index + 1);
    });
    anchor.current = null;
    setSelection(landed);
  }, []);

  return {
    selection,
    selected: orderedSelection(selection),
    select,
    focusForMenu,
    selectAll,
    clear,
    beginDrag: drag.begin,
    dragging: drag.current,
    followOrder,
  };
}

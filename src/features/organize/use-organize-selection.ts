/**
 * Selection and drag bookkeeping for the page grid. The arithmetic lives in
 * selection.ts; this hook only decides which gesture means what and remembers
 * what is being dragged.
 */

import { useCallback, useRef, useState } from 'react';
import {
  extendSelection,
  orderedSelection,
  selectAllPages,
  toggleSelection,
  type PageSelection,
} from './selection';

export interface OrganizeSelection {
  selection: PageSelection;
  /** Selected pages in document order. */
  selected: number[];
  select(page: number, event: React.MouseEvent): void;
  selectAll(pageCount: number): void;
  clear(): void;
  /** Remembers what a drag is carrying: the selection, or the page grabbed. */
  beginDrag(page: number): void;
  dragging(): PageSelection;
  /** After a reorder, follow the moved pages to where they landed. */
  followOrder(order: readonly number[], moved: PageSelection): void;
}

function applyGesture(
  current: PageSelection,
  page: number,
  event: React.MouseEvent,
  anchor: number | null
): PageSelection {
  if (event.shiftKey && anchor !== null) return extendSelection(current, anchor, page);
  return toggleSelection(current, page, event.ctrlKey || event.metaKey);
}

export function useOrganizeSelection(): OrganizeSelection {
  const [selection, setSelection] = useState<PageSelection>(new Set<number>());
  const anchor = useRef<number | null>(null);
  const drag = useRef<PageSelection>(new Set<number>());

  const select = useCallback((page: number, event: React.MouseEvent): void => {
    const from = anchor.current;
    if (!event.shiftKey) anchor.current = page;
    setSelection((current) => applyGesture(current, page, event, from));
  }, []);

  const selectAll = useCallback((pageCount: number): void => {
    setSelection(selectAllPages(pageCount));
  }, []);

  const clear = useCallback((): void => {
    anchor.current = null;
    setSelection(new Set<number>());
  }, []);

  const beginDrag = useCallback(
    (page: number): void => {
      if (selection.has(page)) {
        drag.current = selection;
        return;
      }
      const single = new Set([page]);
      drag.current = single;
      anchor.current = page;
      setSelection(single);
    },
    [selection]
  );

  const followOrder = useCallback((order: readonly number[], moved: PageSelection): void => {
    const landed = new Set<number>();
    order.forEach((page, index) => {
      if (moved.has(page)) landed.add(index + 1);
    });
    setSelection(landed);
  }, []);

  return {
    selection,
    selected: orderedSelection(selection),
    select,
    selectAll,
    clear,
    beginDrag,
    dragging: () => drag.current,
    followOrder,
  };
}

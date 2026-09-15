/**
 * Virtualized continuous scroll. Only the visible pages (plus a couple either
 * side) exist in the DOM, so a 2,000-page document scrolls like a short one.
 * This hook also keeps the store's page number honest and remembers where each
 * tab was left — the exact spot, not just the page: coming back to a tab must
 * land the reader where they were, and the page number alone is up to a whole
 * page off (the owner-reported tab-switch bug).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../../app/store';
import { pageBoxAt } from './page-geometry';
import { NOTHING_OWED, afterRestore, isPageOwed, onViewerRender } from './page-restore';
import type { RestoreState, ViewPosition } from './page-restore';
import { readTabView, writeTabView } from './tab-view-state';
import type { PageSizeIndex } from './use-page-sizes';
import { positionAt, scrollTopFor } from './view-position';
import type { ViewerController } from './viewer-controller';

/** Vertical space between pages (py-3 top and bottom). */
const PAGE_GAP = 24;

type PageVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;

export interface PageNavigation {
  virtualizer: PageVirtualizer;
  goToPage(page: number): void;
}

interface NavigationOptions {
  docId: string;
  pageCount: number;
  zoom: number;
  sizes: PageSizeIndex;
  scrollRef: RefObject<HTMLDivElement | null>;
  controller: ViewerController;
  /**
   * False whenever the page run is not mounted — while the pdfjs document for a
   * new set of bytes loads. Every op swaps the bytes, so this goes false and
   * back on EVERY edit, not only on a tab switch.
   */
  isReady: boolean;
}

/** Scrolls so `position` sits under the top edge, on the rows as measured now. */
function scrollToPosition(
  virtualizer: PageVirtualizer,
  position: ViewPosition,
  pageCount: number
): void {
  const index = Math.min(Math.max(position.page, 1), Math.max(pageCount, 1)) - 1;
  // Asking for the offset measures the rows up to it, which fills the cache.
  const start = virtualizer.getOffsetForIndex(index, 'start')?.[0];
  const size = virtualizer.measurementsCache[index]?.size;
  if (start === undefined || size === undefined) {
    virtualizer.scrollToIndex(index, { align: 'start' });
    return;
  }
  virtualizer.scrollToOffset(scrollTopFor(position, { index, start, size }), { align: 'start' });
}

export function usePageNavigation(options: NavigationOptions): PageNavigation {
  const { controller, docId, isReady, pageCount, scrollRef, sizes, zoom } = options;
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);

  // eslint-disable-next-line react-hooks/incompatible-library -- library-managed subscription: TanStack Virtual owns the store this reads, and its unmemoized getters are read during render only.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const size = sizes.sizeOf(index + 1);
      return size === null ? 800 : Math.round(pageBoxAt(size, zoom).height + PAGE_GAP);
    },
    overscan: 2,
  });

  // The position is filed against the tab as it changes, never from an effect
  // watching the store: on a tab switch the store still holds the outgoing
  // tab's page for one render.
  const remember = useCallback(
    (position: ViewPosition) => {
      setCurrentPage(position.page);
      writeTabView(docId, position);
    },
    [docId, setCurrentPage]
  );

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.min(Math.max(Math.trunc(page), 1), Math.max(pageCount, 1));
      remember({ page: target, offset: 0 });
      virtualizer.scrollToIndex(target - 1, { align: 'start' });
    },
    [pageCount, remember, virtualizer]
  );

  const pending = usePendingPosition(docId, isReady, setCurrentPage);
  useMeasurement(virtualizer, zoom, sizes.version, docId, pageCount, pending.isOwed);
  useScrollTracking(virtualizer, scrollRef, remember, pending.isOwed);
  useEffect(() => controller.attachScroller(goToPage), [controller, goToPage]);

  // Come back to where the document was left — on a tab switch, and after every
  // byte swap, which unmounts the page run and drops the scroll to the top.
  // Page sizes have to be in before the scroll can land on the right spot, and
  // the rows are only MEASURED once they have been drawn at this zoom, so the
  // position is applied again over the next two frames before the viewer is
  // handed back to the reader (tracking stays off until then).
  useEffect(() => {
    if (!isReady || pageCount === 0 || sizes.version === 0) return;
    const position = pending.peek();
    if (position === null) return;
    virtualizer.measure();
    scrollToPosition(virtualizer, position, pageCount);
    let frame = requestAnimationFrame(() => {
      scrollToPosition(virtualizer, position, pageCount);
      frame = requestAnimationFrame(() => {
        scrollToPosition(virtualizer, position, pageCount);
        pending.settle();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [isReady, pageCount, pending, sizes.version, virtualizer]);

  return { virtualizer, goToPage };
}

interface PendingPosition {
  /** The position still owed, or null when nothing is owed. */
  peek(): ViewPosition | null;
  /** The owed position has landed; the viewer is the reader's again. */
  settle(): void;
  /** True while a position is owed — any scroll then is the collapse, not the reader. */
  isOwed(): boolean;
}

/**
 * The position a re-mounted page run owes the attorney — ./page-restore holds
 * the rule and its tests; this is the ref that runs it. The capture happens in
 * the LAYOUT phase, before the collapsing container can fire its scroll event,
 * and the store's page number is set from memory in the same phase so the
 * footer never shows the previous tab's page.
 */
function usePendingPosition(
  docId: string,
  isReady: boolean,
  setCurrentPage: (page: number) => void
): PendingPosition {
  const state = useRef<RestoreState>(NOTHING_OWED);

  useLayoutEffect(() => {
    const remembered = readTabView(docId);
    const wasDocument = state.current.docId;
    state.current = onViewerRender(state.current, docId, isReady, {
      page: remembered.page,
      offset: remembered.offset,
    });
    if (wasDocument !== docId) setCurrentPage(remembered.page);
  }, [docId, isReady, setCurrentPage]);

  return useMemo(
    () => ({
      peek: () => state.current.owed,
      settle: () => {
        state.current = afterRestore(state.current);
      },
      isOwed: () => isPageOwed(state.current),
    }),
    []
  );
}

function useMeasurement(
  virtualizer: PageVirtualizer,
  zoom: number,
  sizesVersion: number,
  docId: string,
  pageCount: number,
  isOwed: () => boolean
): void {
  // A new batch of page sizes landed: re-estimate, but leave the scroll alone.
  useEffect(() => {
    virtualizer.measure();
  }, [sizesVersion, virtualizer]);

  // Zoom changed: every measured height is stale, and the spot the attorney
  // was reading must stay on screen instead of drifting off at the new scale.
  // While a position is still owed (a tab switch refitting its zoom), the
  // restore effect lands it; scrolling here would use the previous tab's page.
  useEffect(() => {
    virtualizer.measure();
    if (isOwed() || pageCount === 0) return;
    const view = readTabView(docId);
    scrollToPosition(virtualizer, { page: view.page, offset: view.offset }, pageCount);
  }, [docId, isOwed, pageCount, virtualizer, zoom]);
}

/** The spot under the top edge of the viewport is where the attorney is reading. */
function useScrollTracking(
  virtualizer: PageVirtualizer,
  scrollRef: RefObject<HTMLDivElement | null>,
  remember: (position: ViewPosition) => void,
  isPageOwed: () => boolean
): void {
  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const onScroll = (): void => {
      // A scroll while the viewer still owes a position is the page run being
      // rebuilt, not the attorney reading; filing page 1 from it is the bug.
      if (isPageOwed()) return;
      const position = positionAt(element.scrollTop, virtualizer.getVirtualItems());
      if (position !== null) remember(position);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [isPageOwed, remember, scrollRef, virtualizer]);
}

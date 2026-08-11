/**
 * Virtualized continuous scroll. Only the visible pages (plus a couple either
 * side) exist in the DOM, so a 2,000-page document scrolls like a short one.
 * This hook also keeps the store's page number honest and remembers where each
 * tab was left.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../../app/store';
import { pageBoxAt } from './page-geometry';
import { NOTHING_OWED, afterRestore, isPageOwed, onViewerRender } from './page-restore';
import type { RestoreState } from './page-restore';
import { readTabView, writeTabView } from './tab-view-state';
import type { PageSizeIndex } from './use-page-sizes';
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

  // The page is filed against the tab as it changes, never from an effect
  // watching the store: on a tab switch the store still holds the outgoing
  // tab's page for one render.
  const rememberPage = useCallback(
    (page: number) => {
      setCurrentPage(page);
      writeTabView(docId, { page });
    },
    [docId, setCurrentPage]
  );

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.min(Math.max(Math.trunc(page), 1), Math.max(pageCount, 1));
      rememberPage(target);
      virtualizer.scrollToIndex(target - 1, { align: 'start' });
    },
    [pageCount, rememberPage, virtualizer]
  );

  useMeasurement(virtualizer, zoom, sizes.version);
  const pending = usePendingPage(docId, isReady);
  useScrollTracking(virtualizer, scrollRef, rememberPage, pending.isOwed);
  useEffect(() => controller.attachScroller(goToPage), [controller, goToPage]);

  // Come back to where the document was left — on a tab switch, and after every
  // byte swap, which unmounts the page run and drops the scroll to the top.
  // Page sizes have to be in before the scroll lands on the right page.
  useEffect(() => {
    if (!isReady || pageCount === 0 || sizes.version === 0) return;
    const page = pending.take();
    if (page === null) return;
    virtualizer.measure();
    virtualizer.scrollToIndex(Math.min(page, pageCount) - 1, { align: 'start' });
  }, [isReady, pageCount, pending, sizes.version, virtualizer]);

  return { virtualizer, goToPage };
}

interface PendingPage {
  /** The page still owed, taken exactly once. Null when there is nothing owed. */
  take(): number | null;
  /** True while a page is owed — any scroll then is the collapse, not the reader. */
  isOwed(): boolean;
}

/**
 * The page a re-mounted page run owes the attorney — ./page-restore holds the
 * rule and its tests; this is the ref that runs it. The capture happens in the
 * LAYOUT phase, before the collapsing container can fire its scroll event.
 */
function usePendingPage(docId: string, isReady: boolean): PendingPage {
  const state = useRef<RestoreState>(NOTHING_OWED);

  useLayoutEffect(() => {
    state.current = onViewerRender(state.current, docId, isReady, readTabView(docId).page);
  }, [docId, isReady]);

  return useMemo(
    () => ({
      take: () => {
        const { owed } = state.current;
        state.current = afterRestore(state.current);
        return owed;
      },
      isOwed: () => isPageOwed(state.current),
    }),
    []
  );
}

function useMeasurement(virtualizer: PageVirtualizer, zoom: number, sizesVersion: number): void {
  // A new batch of page sizes landed: re-estimate, but leave the scroll alone.
  useEffect(() => {
    virtualizer.measure();
  }, [sizesVersion, virtualizer]);

  // Zoom changed: every measured height is stale, and the page the attorney was
  // reading must stay on screen instead of drifting off at the new scale.
  useEffect(() => {
    virtualizer.measure();
    virtualizer.scrollToIndex(useAppStore.getState().currentPage - 1, { align: 'start' });
  }, [virtualizer, zoom]);
}

/** The page under the top edge of the viewport is the page the attorney is on. */
function useScrollTracking(
  virtualizer: PageVirtualizer,
  scrollRef: RefObject<HTMLDivElement | null>,
  rememberPage: (page: number) => void,
  isPageOwed: () => boolean
): void {
  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const onScroll = (): void => {
      // A scroll while the viewer still owes a page is the page run being
      // rebuilt, not the attorney reading; filing page 1 from it is the bug.
      if (isPageOwed()) return;
      const offset = element.scrollTop + 8;
      const visible = virtualizer.getVirtualItems().find((item) => item.end > offset);
      if (visible !== undefined) rememberPage(visible.index + 1);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [isPageOwed, rememberPage, scrollRef, virtualizer]);
}

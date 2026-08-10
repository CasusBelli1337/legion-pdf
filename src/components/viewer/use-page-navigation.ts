/**
 * Virtualized continuous scroll. Only the visible pages (plus a couple either
 * side) exist in the DOM, so a 2,000-page document scrolls like a short one.
 * This hook also keeps the store's page number honest and remembers where each
 * tab was left.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../../app/store';
import { pageBoxAt } from './page-geometry';
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
}

export function usePageNavigation(options: NavigationOptions): PageNavigation {
  const { controller, docId, pageCount, scrollRef, sizes, zoom } = options;
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const restoredFor = useRef<string | null>(null);

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
  useScrollTracking(virtualizer, scrollRef, rememberPage);
  useEffect(() => controller.attachScroller(goToPage), [controller, goToPage]);

  // Come back to a tab where you left it.
  useEffect(() => {
    if (restoredFor.current === docId || pageCount === 0) return;
    restoredFor.current = docId;
    const saved = readTabView(docId).page;
    if (saved > 1) goToPage(saved);
  }, [docId, goToPage, pageCount]);

  return { virtualizer, goToPage };
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
  rememberPage: (page: number) => void
): void {
  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const onScroll = (): void => {
      const offset = element.scrollTop + 8;
      const visible = virtualizer.getVirtualItems().find((item) => item.end > offset);
      if (visible !== undefined) rememberPage(visible.index + 1);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [rememberPage, scrollRef, virtualizer]);
}

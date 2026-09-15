/**
 * The reference pane's own page and zoom, kept entirely to itself.
 *
 * The working viewer mirrors its page number and zoom into the app store — the
 * toolbar, the status footer, the thumbnail rail and every tool panel read them
 * there — and files them against the tab in `tab-view-state`. The reference
 * pane must do NEITHER: scrolling or zooming the document you are comparing
 * against has to leave the document you are working on exactly where it was,
 * and it must not overwrite the saved zoom of a tab it is only borrowing.
 *
 * So this hook is the small honest version of `useViewerState`: its own
 * `ViewerController` (nothing registers overlays into it, so the reference pane
 * carries no tool marks), its own virtualizer, and plain React state for the
 * numbers. It is remounted per document — the pane is keyed by docId — so there
 * is no stale geometry to clear.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { fitWidthZoom, pageBoxAt } from './page-geometry';
import { usePdfDocument } from './pdf-document-cache';
import { usePageSizes, type PageSizeIndex } from './use-page-sizes';
import { ViewerController } from './viewer-controller';

/** Page padding plus the scrollbar, matching the working viewer's gutter. */
const GUTTER = 56;
/** Vertical space between pages (py-3 top and bottom). */
const PAGE_GAP = 24;
const WHEEL_STEP = 1.1;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

type PageVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;

export interface ReferenceView {
  controller: ViewerController;
  document: PDFDocumentProxy | null;
  error: string | null;
  isReady: boolean;
  sizes: PageSizeIndex;
  zoom: number;
  currentPage: number;
  virtualizer: PageVirtualizer;
  setZoom(zoom: number): void;
  zoomBy(factor: number): void;
  goToPage(page: number): void;
}

function clamp(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
}

interface ReferenceZoom {
  zoom: number;
  setZoom(zoom: number): void;
  zoomBy(factor: number): void;
}

/**
 * Starts fitted to the pane's width — a Letter page at 100% in half a window is
 * unreadable — and stops fitting the moment the attorney names a zoom, so a
 * dragged divider no longer overrides the number they chose.
 */
function useReferenceZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  sizes: PageSizeIndex
): ReferenceZoom {
  const [state, setState] = useState({ zoom: 1, isFitted: true });
  const firstPage = sizes.sizeOf(1);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null || firstPage === null || !state.isFitted) return;
    const fit = (): void =>
      setState((current) =>
        current.isFitted
          ? { ...current, zoom: clamp(fitWidthZoom(element.clientWidth, firstPage, GUTTER)) }
          : current
      );
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [firstPage, scrollRef, state.isFitted]);

  const setZoom = useCallback(
    (zoom: number) => setState({ zoom: clamp(zoom), isFitted: false }),
    []
  );
  const zoomBy = useCallback(
    (factor: number) =>
      setState((current) => ({ zoom: clamp(current.zoom * factor), isFitted: false })),
    []
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [scrollRef, zoomBy]);

  return { zoom: state.zoom, setZoom, zoomBy };
}

/** The page under the top edge of the reference pane — local state, never the store. */
function useReferencePaging(
  virtualizer: PageVirtualizer,
  scrollRef: RefObject<HTMLDivElement | null>,
  pageCount: number
): { currentPage: number; goToPage: (page: number) => void } {
  const [currentPage, setCurrentPage] = useState(1);

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.min(Math.max(Math.trunc(page), 1), Math.max(pageCount, 1));
      setCurrentPage(target);
      virtualizer.scrollToIndex(target - 1, { align: 'start' });
    },
    [pageCount, virtualizer]
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const onScroll = (): void => {
      const offset = element.scrollTop + 8;
      const visible = virtualizer.getVirtualItems().find((item) => item.end > offset);
      if (visible !== undefined) setCurrentPage(visible.index + 1);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [scrollRef, virtualizer]);

  return { currentPage, goToPage };
}

export function useReferenceView(
  bytes: Uint8Array,
  docId: string,
  pageCount: number,
  scrollRef: RefObject<HTMLDivElement | null>
): ReferenceView {
  const [controller] = useState(() => new ViewerController());
  const { document, error } = usePdfDocument(bytes, docId);
  const sizes = usePageSizes(document, controller);
  const { zoom, setZoom, zoomBy } = useReferenceZoom(scrollRef, sizes);

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

  const paging = useReferencePaging(virtualizer, scrollRef, pageCount);

  // A new batch of page sizes landed: re-estimate, but leave the scroll alone.
  useEffect(() => {
    virtualizer.measure();
  }, [sizes.version, virtualizer]);

  // Zoom changed: every measured height is stale, and the page being read must
  // stay on screen instead of drifting off at the new scale. The page comes
  // from a ref so that scrolling — which changes `currentPage` constantly —
  // does not re-trigger this.
  const pageRef = useRef(1);
  useEffect(() => {
    pageRef.current = paging.currentPage;
  }, [paging.currentPage]);
  useEffect(() => {
    virtualizer.measure();
    virtualizer.scrollToIndex(pageRef.current - 1, { align: 'start' });
  }, [virtualizer, zoom]);

  return {
    controller,
    document,
    error,
    isReady: error === null && document !== null,
    sizes,
    zoom,
    setZoom,
    zoomBy,
    virtualizer,
    ...paging,
  };
}

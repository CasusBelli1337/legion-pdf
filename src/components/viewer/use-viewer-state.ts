/**
 * Everything the viewer needs, assembled once: the pdfjs document for the
 * active tab's bytes, page sizes, zoom, virtualized navigation, and search.
 * Keeping the wiring here leaves the component itself as plain layout.
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { DocumentSession } from '@shared/types';
import { useAppStore } from '../../app/store';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { useFormSession } from '../../features/forms/form-session';
import { usePageRoles, type PageRoles } from './page-classification';
import { usePdfDocument } from './pdf-document-cache';
import type { FitMode } from './tab-view-state';
import { useDocumentSearch } from './use-document-search';
import { usePageNavigation } from './use-page-navigation';
import { usePageSizes, type PageSizeIndex } from './use-page-sizes';
import { useZoomControls } from './use-zoom-controls';
import { useViewerController } from './viewer-context';
import type { ViewerController } from './viewer-controller';

export interface ViewerState {
  controller: ViewerController;
  document: PDFDocumentProxy | null;
  /** The doc-store id behind `document`; the form lane keys its edits by it. */
  docId: string;
  error: string | null;
  isLoading: boolean;
  /**
   * True whenever there is a document to draw — including the generation an
   * edit has just superseded, which stays on screen until its replacement has
   * rendered. The page run is mounted for exactly this long, so an edit never
   * unmounts it and the pages never blank.
   */
  isReady: boolean;
  /** Text roles for the pages, when the selection lane has classified them. */
  roles: PageRoles;
  sizes: PageSizeIndex;
  zoom: number;
  fitMode: FitMode;
  setZoom(zoom: number): void;
  zoomBy(factor: number): void;
  setFitMode(mode: FitMode): void;
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  goToPage(page: number): void;
  currentPage: number;
}

export function useViewerState(
  session: DocumentSession,
  scrollRef: RefObject<HTMLDivElement | null>
): ViewerState {
  const controller = useViewerController();
  const { document, error, isLoading } = usePdfDocument(session.bytes, session.id);
  const isReady = error === null && document !== null;
  const sizes = usePageSizes(document, controller);
  const roles = usePageRoles(document, session.id);
  const zoomControls = useZoomControls(session.id, scrollRef, sizes.sizeOf(1));
  const navigation = usePageNavigation({
    docId: session.id,
    pageCount: session.pageCount,
    zoom: zoomControls.zoom,
    sizes,
    scrollRef,
    controller,
    isReady,
  });
  useDocumentSearch(document, controller);
  useFormSession(document, session.id);
  const currentPage = useAppStore((state) => state.currentPage);

  return {
    controller,
    document,
    docId: session.id,
    error,
    isLoading,
    isReady,
    roles,
    sizes,
    currentPage,
    ...zoomControls,
    ...navigation,
  };
}

/** Ctrl+F anywhere in the app opens the find bar. */
export function useFindShortcut(open: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
}

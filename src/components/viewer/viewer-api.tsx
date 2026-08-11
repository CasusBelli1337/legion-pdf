/**
 * `ViewerApi` as a React context. The provider wraps the whole workspace row —
 * the viewer AND the tool dock — so a tool panel can place a mark on the page
 * it can see. It holds no page state itself: the numbers come from the app
 * store, the geometry from the controller the viewer registers into.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useActiveSession, useAppStore } from '../../app/store';
import { ViewerController } from './viewer-controller';
import { ViewerApiContext, ViewerControllerContext } from './viewer-context';
import type { ViewerApi } from './viewer-types';

interface ViewerApiProviderProps {
  children: ReactNode;
}

export function ViewerApiProvider({ children }: ViewerApiProviderProps) {
  const [controller] = useState(() => new ViewerController());

  const session = useActiveSession();
  const currentPage = useAppStore((state) => state.currentPage);
  const zoom = useAppStore((state) => state.zoom);
  const setZoom = useAppStore((state) => state.setZoom);

  const docId = session?.id ?? null;
  const pageCount = session?.pageCount ?? 0;

  const api = useMemo<ViewerApi | null>(() => {
    if (docId === null) return null;
    return {
      docId,
      pageCount,
      currentPage,
      zoom,
      setZoom,
      goToPage: (page) => controller.goToPage(page),
      clientToPdf: (page, point) => controller.clientToPdf(page, point),
      pdfToClient: (page, point) => controller.pdfToClient(page, point),
      pageSize: (page) => controller.pageSize(page),
      registerOverlay: (id, render) => controller.registerOverlay(id, render),
      findText: (query, onProgress) => controller.findText(query, onProgress),
    };
  }, [controller, currentPage, docId, pageCount, setZoom, zoom]);

  return (
    <ViewerControllerContext.Provider value={controller}>
      <ViewerApiContext.Provider value={api}>{children}</ViewerApiContext.Provider>
    </ViewerControllerContext.Provider>
  );
}

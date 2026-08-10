/**
 * Zoom: buttons, Ctrl+wheel, fit-width, fit-page — all funnelled through the
 * app store (so the View menu and status footer agree) and remembered per tab.
 *
 * Every zoom is written to the tab's saved view AT THE MOMENT IT IS APPLIED,
 * never from an effect watching the current zoom: on a tab switch the store
 * still holds the outgoing tab's number for one render, and persisting that
 * would file the wrong zoom against the incoming document.
 */

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { PageSize } from '@shared/types';
import { useAppStore } from '../../app/store';
import { fitPageZoom, fitWidthZoom } from './page-geometry';
import { readTabView, writeTabView, type FitMode } from './tab-view-state';

/** Page padding plus the scrollbar, so a fitted page never triggers a sideways scroll. */
const GUTTER = 56;
const WHEEL_STEP = 1.1;

export interface ZoomControls {
  zoom: number;
  fitMode: FitMode;
  /** Explicit zoom from a button or the percentage box; drops the fit preset. */
  setZoom(zoom: number): void;
  /** Multiply the current zoom, e.g. Ctrl+wheel or the +/- buttons. */
  zoomBy(factor: number): void;
  setFitMode(mode: FitMode): void;
}

/** The fit preset for the active tab; a fresh tab inherits what it was saved with. */
function useFitMode(docId: string | null): [FitMode, (mode: FitMode) => void] {
  const [chosen, setChosen] = useState<{ docId: string | null; mode: FitMode }>({
    docId: null,
    mode: 'width',
  });
  const fitMode =
    chosen.docId === docId ? chosen.mode : docId === null ? 'none' : readTabView(docId).fitMode;
  const setFitMode = useCallback(
    (mode: FitMode) => {
      setChosen({ docId, mode });
      if (docId !== null) writeTabView(docId, { fitMode: mode });
    },
    [docId]
  );
  return [fitMode, setFitMode];
}

/** Recompute the zoom whenever the window, the preset, or the page size changes. */
function useFitToContainer(
  docId: string | null,
  fitMode: FitMode,
  scrollRef: RefObject<HTMLElement | null>,
  pageSize: PageSize | null
): void {
  const setStoreZoom = useAppStore((state) => state.setZoom);

  const applyFit = useCallback(() => {
    const element = scrollRef.current;
    if (fitMode === 'none' || element === null || pageSize === null) return;
    setStoreZoom(
      fitMode === 'width'
        ? fitWidthZoom(element.clientWidth, pageSize, GUTTER)
        : fitPageZoom(element.clientWidth, element.clientHeight, pageSize, GUTTER)
    );
    if (docId !== null) writeTabView(docId, { zoom: useAppStore.getState().zoom });
  }, [docId, fitMode, pageSize, scrollRef, setStoreZoom]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    applyFit();
    const observer = new ResizeObserver(applyFit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [applyFit, scrollRef]);
}

export function useZoomControls(
  docId: string | null,
  scrollRef: RefObject<HTMLElement | null>,
  pageSize: PageSize | null
): ZoomControls {
  const zoom = useAppStore((state) => state.zoom);
  const setStoreZoom = useAppStore((state) => state.setZoom);
  const [fitMode, setFitMode] = useFitMode(docId);

  // Switching tabs restores that document's zoom (the store holds only the active one).
  useEffect(() => {
    if (docId !== null) setStoreZoom(readTabView(docId).zoom);
  }, [docId, setStoreZoom]);

  useFitToContainer(docId, fitMode, scrollRef, pageSize);

  const setZoom = useCallback(
    (value: number) => {
      setFitMode('none');
      setStoreZoom(value);
      if (docId !== null) writeTabView(docId, { zoom: useAppStore.getState().zoom });
    },
    [docId, setFitMode, setStoreZoom]
  );

  const zoomBy = useCallback(
    (factor: number) => setZoom(useAppStore.getState().zoom * factor),
    [setZoom]
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

  return { zoom, fitMode, setZoom, zoomBy, setFitMode };
}

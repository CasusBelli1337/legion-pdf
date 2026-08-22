/**
 * The document viewer: toolbar, find bar, and the virtualized page run. It owns
 * no document state of its own — the bytes come from the store, the geometry
 * goes into the controller behind ViewerApi.
 */

import { useCallback, useRef, useState } from 'react';
import type { DocumentSession } from '@shared/types';
import { FindBar } from '../../features/find';
import { CoordinateHarness } from './coordinate-harness';
import { PageList } from './page-list';
import { PrintSheet } from './print-sheet';
import { SelectionMenuHost } from './selection-menu-host';
import { useSmartCopy } from './use-smart-copy';
import { useFindShortcut, useViewerState } from './use-viewer-state';
import { ViewerToolbar } from './viewer-toolbar';

interface PdfViewerProps {
  session: DocumentSession;
}

function ViewerNotice({ message, isError }: { message: string; isError: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-2">
      {!isError && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />}
      <p className={`readout ${isError ? 'text-danger' : 'text-text-secondary'}`}>{message}</p>
    </div>
  );
}

/**
 * The scrolling page run. The gutter is reserved whether or not the run is
 * currently long enough to scroll: without that, a document whose height sits
 * right on the boundary adds a scrollbar, which narrows fit-width, which
 * shortens the run, which removes the scrollbar — and the page oscillates,
 * restarting its render every time.
 */
function ViewerBody({
  view,
  scrollRef,
}: {
  view: ReturnType<typeof useViewerState>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-auto"
      style={{ scrollbarGutter: 'stable' }}
    >
      {view.error !== null && <ViewerNotice message={view.error} isError />}
      {view.error === null && !view.isReady && (
        <ViewerNotice message="Opening document" isError={false} />
      )}
      {view.isReady && (
        <PageList
          document={view.document}
          docId={view.docId}
          virtualizer={view.virtualizer}
          sizes={view.sizes}
          zoom={view.zoom}
          controller={view.controller}
          roles={view.roles}
        />
      )}
    </div>
  );
}

export function PdfViewer({ session }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = useViewerState(session, scrollRef);
  const [isFindOpen, setFindOpen] = useState(false);
  const [isHarnessOpen, setHarnessOpen] = useState(false);

  useFindShortcut(useCallback(() => setFindOpen(true), []));
  // Ctrl+C over the pages copies the paragraph, not the transcript (F-3).
  useSmartCopy(view.document, session.id, scrollRef);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-armory-canvas">
      <ViewerToolbar
        currentPage={view.currentPage}
        pageCount={session.pageCount}
        zoom={view.zoom}
        fitMode={view.fitMode}
        isFindOpen={isFindOpen}
        showHarness={import.meta.env.DEV}
        onGoToPage={view.goToPage}
        onZoomBy={view.zoomBy}
        onSetZoom={view.setZoom}
        onFit={view.setFitMode}
        onToggleFind={() => setFindOpen((open) => !open)}
        onToggleHarness={() => setHarnessOpen((open) => !open)}
      />
      {isFindOpen && <FindBar onClose={() => setFindOpen(false)} />}
      {isHarnessOpen && <CoordinateHarness onClose={() => setHarnessOpen(false)} />}
      {/* No padding here: the page list adds the gutter itself, so a fitted
          page never overflows into a horizontal scrollbar. */}
      <ViewerBody view={view} scrollRef={scrollRef} />
      <SelectionMenuHost scrollRef={scrollRef} />
      <PrintSheet />
    </div>
  );
}

/**
 * The RIGHT half of side by side: a second document, for reading only.
 *
 * It renders the same pages as the working viewer, from the same pdfjs document
 * cache, but through its own controller and its own page/zoom state (see
 * ./use-reference-view). Nothing registers overlays into that controller, so no
 * tool marks, redaction boxes or signature handles appear here — this pane is
 * the exhibit you are checking against, not the one you are editing.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { DragEvent } from 'react';
import type { DocumentSession } from '@shared/types';
import { useAppStore, useSplitSession } from '../../app/store';
import { NO_ROLES } from './page-classification';
import { PageList } from './page-list';
import { ReferenceHeader } from './reference-header';
import { hasTabDrag, tabDragId } from './tab-drag';
import { useReferenceView } from './use-reference-view';

/** The header controls that belong to the pane rather than to its document. */
interface PaneChrome {
  choices: readonly DocumentSession[];
  isSynced: boolean;
  onChoose(docId: string): void;
  onToggleSync(): void;
  onSwap(): void;
  onClose(): void;
}

/**
 * Page-level sync, not pixel: two different documents almost never share a page
 * height, so following the scroll offset would drift. Following the page number
 * is the thing an attorney actually means by "keep them together".
 */
function useSyncedPage(goToPage: (page: number) => void, isSynced: boolean): void {
  const workingPage = useAppStore((state) => state.currentPage);
  useEffect(() => {
    if (isSynced) goToPage(workingPage);
  }, [goToPage, isSynced, workingPage]);
}

function EmptyReference({ chrome }: { chrome: PaneChrome }) {
  return (
    <>
      <ReferenceHeader
        {...chrome}
        docId={null}
        currentPage={1}
        pageCount={0}
        zoom={1}
        onGoToPage={() => undefined}
        onZoomBy={() => undefined}
        onSetZoom={() => undefined}
      />
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <p className="max-w-60 text-center text-sm text-text-secondary">
          Open another document to view it here.
        </p>
      </div>
    </>
  );
}

function LoadedReference({ session, chrome }: { session: DocumentSession; chrome: PaneChrome }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = useReferenceView(session.bytes, session.id, session.pageCount, scrollRef);
  useSyncedPage(view.goToPage, chrome.isSynced);

  return (
    <>
      <ReferenceHeader
        {...chrome}
        docId={session.id}
        currentPage={view.currentPage}
        pageCount={session.pageCount}
        zoom={view.zoom}
        onGoToPage={view.goToPage}
        onZoomBy={view.zoomBy}
        onSetZoom={view.setZoom}
      />
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto"
        style={{ scrollbarGutter: 'stable' }}
      >
        {view.error !== null && <p className="readout p-6 text-center text-danger">{view.error}</p>}
        {view.error === null && !view.isReady && (
          <p className="readout p-6 text-center text-text-secondary">Opening document</p>
        )}
        {view.isReady && (
          <PageList
            document={view.document}
            docId={session.id}
            virtualizer={view.virtualizer}
            sizes={view.sizes}
            zoom={view.zoom}
            controller={view.controller}
            roles={NO_ROLES}
          />
        )}
      </div>
    </>
  );
}

export function ReferencePane() {
  const session = useSplitSession();
  const sessions = useAppStore((state) => state.sessions);
  const activeId = useAppStore((state) => state.activeId);
  const isSynced = useAppStore((state) => state.isSplitSynced);
  const setSplitDoc = useAppStore((state) => state.setSplitDoc);
  const setSplitSynced = useAppStore((state) => state.setSplitSynced);
  const swapSplit = useAppStore((state) => state.swapSplit);
  const toggleSplit = useAppStore((state) => state.toggleSplit);

  // A tab dropped here is shown here; dropping the tab that is already in front
  // swaps the panes (the store's rule — one file, one pane).
  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const docId = tabDragId(event.dataTransfer);
      if (docId === null) return;
      event.preventDefault();
      event.stopPropagation();
      setSplitDoc(docId);
    },
    [setSplitDoc]
  );

  const chrome: PaneChrome = {
    choices: sessions.filter((item) => item.id !== activeId),
    isSynced,
    onChoose: setSplitDoc,
    onToggleSync: () => setSplitSynced(!isSynced),
    onSwap: swapSplit,
    onClose: toggleSplit,
  };

  return (
    <section
      aria-label="Reference document"
      className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-armory-border bg-armory-canvas"
      onDragOver={(event) => {
        if (!hasTabDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={onDrop}
    >
      {session === null ? (
        <EmptyReference chrome={chrome} />
      ) : (
        <LoadedReference key={session.id} session={session} chrome={chrome} />
      )}
    </section>
  );
}

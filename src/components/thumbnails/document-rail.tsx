/**
 * The right rail: page thumbnails and document bookmarks, one tab each. It
 * shares the viewer's pdfjs document, so opening the rail costs nothing beyond
 * drawing the thumbnails that are actually on screen.
 *
 * Its inner border is a splitter. Widening the rail makes the thumbnails
 * themselves bigger — the point of dragging it out is to read the page, not to
 * get more white space around a stamp-sized picture.
 */

import { useState } from 'react';
import { RAIL_SIZE, ResizeHandle, usePanelWidth } from '../../app/shell/panels';
import { useActiveSession, useAppStore } from '../../app/store';
import { usePdfDocument, useViewerApi } from '../viewer';
import { BookmarkTree } from './bookmark-tree';
import { ThumbnailList } from './thumbnail-list';
import { useBookmarkEditor } from './use-bookmark-editing';
import { useBookmarks } from './use-bookmarks';

type RailTab = 'pages' | 'bookmarks';

/** Equal padding either side of both labels, so neither crowds the rail edge. */
const TAB =
  'flex h-full flex-1 items-center justify-center border-b-2 px-3 transition-colors duration-150';

function RailTabs({ tab, onTab }: { tab: RailTab; onTab(tab: RailTab): void }) {
  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1 border-b border-armory-border px-2">
      {(['pages', 'bookmarks'] as const).map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onTab(name)}
          aria-pressed={tab === name}
          className={`${TAB} ${
            tab === name
              ? 'border-b-brand-700 text-brand-400'
              : 'border-b-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <span className="readout truncate">{name === 'pages' ? 'Pages' : 'Bookmarks'}</span>
        </button>
      ))}
    </div>
  );
}

/** Rail width minus its padding and border: how wide a thumbnail may be drawn. */
function thumbnailWidth(railWidth: number): number {
  return Math.max(96, railWidth - 36);
}

export function DocumentRail() {
  const session = useActiveSession();
  const currentPage = useAppStore((state) => state.currentPage);
  const api = useViewerApi();
  const [tab, setTab] = useState<RailTab>('pages');
  const rail = usePanelWidth(RAIL_SIZE, 'left');
  const { document } = usePdfDocument(session?.bytes ?? null, session?.id);
  const { bookmarks, isLoading, reload } = useBookmarks(session?.id ?? null, document);
  const editor = useBookmarkEditor(session?.id ?? null, reload);

  const goToPage = (page: number): void => api?.goToPage(page);

  return (
    <>
      <ResizeHandle control={rail} label="Thumbnail rail width" />
      <aside
        className="flex min-w-0 shrink-0 flex-col bg-armory-surface"
        style={{ width: `${rail.width}px` }}
      >
        <RailTabs tab={tab} onTab={setTab} />
        {session === null ? (
          <p className="p-3 text-xs text-text-muted">No document open.</p>
        ) : tab === 'pages' ? (
          <ThumbnailList
            document={document}
            pageCount={session.pageCount}
            currentPage={currentPage}
            width={thumbnailWidth(rail.width)}
            onSelect={goToPage}
          />
        ) : (
          <BookmarkTree
            bookmarks={bookmarks}
            isLoading={isLoading}
            currentPage={currentPage}
            busy={editor.busy}
            error={editor.error}
            onSelect={goToPage}
            onCommit={(tree, receipt) => void editor.save(tree, receipt)}
          />
        )}
      </aside>
    </>
  );
}

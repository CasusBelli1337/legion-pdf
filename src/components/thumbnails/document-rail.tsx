/**
 * The right rail: page thumbnails and document bookmarks, one tab each. It
 * shares the viewer's pdfjs document, so opening the rail costs nothing beyond
 * drawing the thumbnails that are actually on screen.
 */

import { useState } from 'react';
import { useActiveSession, useAppStore } from '../../app/store';
import { usePdfDocument, useViewerApi } from '../viewer';
import { BookmarkTree } from './bookmark-tree';
import { ThumbnailList } from './thumbnail-list';
import { useBookmarkEditor } from './use-bookmark-editing';
import { useBookmarks } from './use-bookmarks';

type RailTab = 'pages' | 'bookmarks';

const TAB =
  'flex h-full flex-1 items-center justify-center border-b-2 transition-colors duration-150';

function RailTabs({ tab, onTab }: { tab: RailTab; onTab(tab: RailTab): void }) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-armory-border">
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
          <span className="readout">{name === 'pages' ? 'Pages' : 'Bookmarks'}</span>
        </button>
      ))}
    </div>
  );
}

export function DocumentRail() {
  const session = useActiveSession();
  const currentPage = useAppStore((state) => state.currentPage);
  const api = useViewerApi();
  const [tab, setTab] = useState<RailTab>('pages');
  const { document } = usePdfDocument(session?.bytes ?? null);
  const { bookmarks, isLoading, reload } = useBookmarks(session?.id ?? null, document);
  const editor = useBookmarkEditor(session?.id ?? null, reload);

  const goToPage = (page: number): void => api?.goToPage(page);
  // Wider on the bookmarks tab: rename and remove need room next to the title.
  const width = tab === 'bookmarks' ? 'w-56' : 'w-40';

  return (
    <aside
      className={`flex ${width} shrink-0 flex-col border-l border-armory-border bg-armory-surface`}
    >
      <RailTabs tab={tab} onTab={setTab} />
      {session === null ? (
        <p className="p-3 text-xs text-text-muted">No document open.</p>
      ) : tab === 'pages' ? (
        <ThumbnailList
          document={document}
          pageCount={session.pageCount}
          currentPage={currentPage}
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
  );
}

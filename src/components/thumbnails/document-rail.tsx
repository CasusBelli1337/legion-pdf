/**
 * The left rail: page thumbnails and document bookmarks, one tab each. It
 * shares the viewer's pdfjs document, so opening the rail costs nothing beyond
 * drawing the thumbnails that are actually on screen.
 */

import { useState } from 'react';
import { useActiveSession, useAppStore } from '../../app/store';
import { usePdfDocument, useViewerApi } from '../viewer';
import { BookmarkTree } from './bookmark-tree';
import { ThumbnailList } from './thumbnail-list';
import { useBookmarks } from './use-bookmarks';

type RailTab = 'pages' | 'bookmarks';

const TAB =
  'flex h-full flex-1 items-center justify-center border-b-2 transition-colors duration-150';

export function DocumentRail() {
  const session = useActiveSession();
  const currentPage = useAppStore((state) => state.currentPage);
  const api = useViewerApi();
  const [tab, setTab] = useState<RailTab>('pages');
  const { document } = usePdfDocument(session?.bytes ?? null);
  const { bookmarks, isLoading } = useBookmarks(session?.id ?? null, document);

  const goToPage = (page: number): void => api?.goToPage(page);

  return (
    <aside className="flex w-40 shrink-0 flex-col border-r border-armory-border bg-armory-surface">
      <div className="flex h-9 shrink-0 items-stretch border-b border-armory-border">
        {(['pages', 'bookmarks'] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            aria-pressed={tab === name}
            className={`${TAB} ${
              tab === name
                ? 'border-b-purple-700 text-purple-400'
                : 'border-b-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <span className="readout">{name === 'pages' ? 'Pages' : 'Bookmarks'}</span>
          </button>
        ))}
      </div>

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
        <BookmarkTree bookmarks={bookmarks} isLoading={isLoading} onSelect={goToPage} />
      )}
    </aside>
  );
}

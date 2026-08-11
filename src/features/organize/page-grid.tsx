/**
 * The virtualized thumbnail grid. Only the rows on screen are rasterized, so a
 * 2,000-page document opens the panel instantly. Click selects, Ctrl-click adds,
 * Shift-click extends, and dragging drops the selection in front of a page.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DocumentSession } from '@shared/types';
import { gridScrollTop, type PageSelection } from './selection';
import type { PageThumbnails } from './use-page-thumbnails';

const COLUMNS = 2;
const ROW_HEIGHT = 136;

interface CellHandlers {
  onSelect(page: number, event: React.MouseEvent): void;
  onDragStart(page: number): void;
  onDragOver(page: number): void;
  onDrop(page: number): void;
}

interface PageCellProps extends CellHandlers {
  page: number;
  selected: boolean;
  dropTarget: boolean;
  thumbnails: PageThumbnails;
}

function PageCell({ page, selected, dropTarget, thumbnails, ...handlers }: PageCellProps) {
  const url = thumbnails.urlFor(page);

  useEffect(() => thumbnails.request(page), [thumbnails, page]);

  return (
    <button
      type="button"
      draggable
      aria-pressed={selected}
      aria-label={`Page ${page}`}
      onClick={(event) => handlers.onSelect(page, event)}
      onDragStart={() => handlers.onDragStart(page)}
      onDragOver={(event) => {
        event.preventDefault();
        handlers.onDragOver(page);
      }}
      onDrop={(event) => {
        event.preventDefault();
        handlers.onDrop(page);
      }}
      className={`flex h-[124px] flex-col items-center justify-between rounded-md border p-1 transition-colors duration-150 ${
        selected
          ? 'border-purple-700 bg-armory-interactive'
          : 'border-armory-border bg-armory-elevated hover:border-armory-border-strong'
      } ${dropTarget ? 'border-l-2 border-l-purple-400' : ''}`}
    >
      <span className="flex flex-1 items-center justify-center overflow-hidden">
        {url === undefined ? (
          <span className="readout text-text-muted">...</span>
        ) : (
          <img src={url} alt="" className="max-h-[92px] max-w-full object-contain" />
        )}
      </span>
      <span className={`readout ${selected ? 'text-purple-400' : 'text-text-muted'}`}>{page}</span>
    </button>
  );
}

interface GridRowProps extends CellHandlers {
  firstPage: number;
  pageCount: number;
  height: number;
  offset: number;
  selection: PageSelection;
  dropTarget: number | null;
  thumbnails: PageThumbnails;
}

function GridRow({ firstPage, pageCount, height, offset, ...rest }: GridRowProps) {
  const pages = Array.from({ length: COLUMNS }, (_unused, column) => firstPage + column).filter(
    (page) => page <= pageCount
  );

  return (
    <div
      className="absolute left-0 grid w-full grid-cols-2 gap-2"
      style={{ height: `${height}px`, transform: `translateY(${offset}px)` }}
    >
      {pages.map((page) => (
        <PageCell
          key={page}
          page={page}
          selected={rest.selection.has(page)}
          dropTarget={rest.dropTarget === page}
          thumbnails={rest.thumbnails}
          onSelect={rest.onSelect}
          onDragStart={rest.onDragStart}
          onDragOver={rest.onDragOver}
          onDrop={rest.onDrop}
        />
      ))}
    </div>
  );
}

interface EndZoneProps {
  active: boolean;
  onDragOver(): void;
  onDrop(): void;
}

function EndDropZone({ active, onDragOver, onDrop }: EndZoneProps) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`mt-2 rounded-md border border-dashed py-3 text-center text-xs ${
        active ? 'border-purple-400 text-purple-400' : 'border-armory-border text-text-muted'
      }`}
    >
      Drop here to move to the end
    </div>
  );
}

interface PageGridProps {
  session: DocumentSession;
  selection: PageSelection;
  thumbnails: PageThumbnails;
  /** The page the viewer is on: brought into view when the panel opens. */
  openOn: number;
  onSelect(page: number, event: React.MouseEvent): void;
  onDragPage(page: number): void;
  /** Drop the dragged selection immediately before this page (pageCount + 1 = end). */
  onDropBefore(page: number): void;
}

export function PageGrid({ session, selection, thumbnails, openOn, ...handlers }: PageGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- library-managed subscription: TanStack Virtual owns the store this reads, and its unmemoized getters are read during render only.
  const virtualizer = useVirtualizer({
    count: Math.ceil(session.pageCount / COLUMNS),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });

  // As the panel opens: the selected page is no use out of sight. The offset is
  // set on the element itself — every row is ROW_HEIGHT tall, so it is exact,
  // and writing the same number twice (React's double-invoked effects) is a
  // no-op, where a scroll animation would fight itself.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null || session.pageCount === 0) return;
    element.scrollTop = gridScrollTop(openOn, COLUMNS, ROW_HEIGHT, element.clientHeight);
  }, [openOn, session.pageCount]);

  const drop = (page: number): void => {
    setDropTarget(null);
    handlers.onDropBefore(page);
  };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => (
          <GridRow
            key={row.key}
            firstPage={row.index * COLUMNS + 1}
            pageCount={session.pageCount}
            height={row.size}
            offset={row.start}
            selection={selection}
            dropTarget={dropTarget}
            thumbnails={thumbnails}
            onSelect={handlers.onSelect}
            onDragStart={handlers.onDragPage}
            onDragOver={setDropTarget}
            onDrop={drop}
          />
        ))}
      </div>
      <EndDropZone
        active={dropTarget === session.pageCount + 1}
        onDragOver={() => setDropTarget(session.pageCount + 1)}
        onDrop={() => drop(session.pageCount + 1)}
      />
    </div>
  );
}

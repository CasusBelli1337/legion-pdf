/**
 * The virtualized thumbnail grid. Only the rows on screen are rasterized, so a
 * 2,000-page document opens the panel instantly. Click selects, Ctrl-click adds,
 * Shift-click extends, dragging drops the selection in front of a page, and
 * right-clicking offers to take the viewer to that page.
 *
 * The cells follow the panel's width: dragging the dock out is how an attorney
 * gets previews big enough to tell two exhibits apart.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CornerDownRight } from 'lucide-react';
import type { DocumentSession } from '@shared/types';
import { ContextMenu, type ContextMenuAnchor } from '../../app/shell/context-menu';
import { useViewerApi } from '../../components/viewer';
import { cellHeight, gridScrollTop, type PageSelection } from './selection';
import type { PageThumbnails } from './use-page-thumbnails';

const COLUMNS = 2;
const GRID_GAP = 8;
const GRID_PADDING = 16;

interface CellHandlers {
  onSelect(page: number, event: React.MouseEvent): void;
  onDragStart(page: number): void;
  onDragOver(page: number): void;
  onDrop(page: number): void;
  onContext(page: number, event: React.MouseEvent): void;
}

interface PageCellProps extends CellHandlers {
  page: number;
  selected: boolean;
  dropTarget: boolean;
  height: number;
  thumbnails: PageThumbnails;
}

function PageCell({ page, selected, dropTarget, height, thumbnails, ...handlers }: PageCellProps) {
  const url = thumbnails.urlFor(page);

  useEffect(() => thumbnails.request(page), [thumbnails, page]);

  return (
    <button
      type="button"
      draggable
      aria-pressed={selected}
      aria-label={`Page ${page}`}
      style={{ height: `${height}px` }}
      onClick={(event) => handlers.onSelect(page, event)}
      onContextMenu={(event) => handlers.onContext(page, event)}
      onDragStart={() => handlers.onDragStart(page)}
      onDragOver={(event) => {
        event.preventDefault();
        handlers.onDragOver(page);
      }}
      onDrop={(event) => {
        event.preventDefault();
        handlers.onDrop(page);
      }}
      className={`flex flex-col items-center justify-between rounded-md border p-1 transition-colors duration-150 ${
        selected
          ? 'border-brand-700 bg-armory-interactive'
          : 'border-armory-border bg-armory-elevated hover:border-armory-border-strong'
      } ${dropTarget ? 'border-l-2 border-l-brand-400' : ''}`}
    >
      <span className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {url === undefined ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
            <span className="readout text-text-muted">Drawing</span>
          </span>
        ) : (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        )}
      </span>
      <span className={`readout ${selected ? 'text-brand-400' : 'text-text-muted'}`}>{page}</span>
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
          height={height - GRID_GAP}
          selected={rest.selection.has(page)}
          dropTarget={rest.dropTarget === page}
          thumbnails={rest.thumbnails}
          onSelect={rest.onSelect}
          onContext={rest.onContext}
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
        active ? 'border-brand-400 text-brand-400' : 'border-armory-border text-text-muted'
      }`}
    >
      Drop here to move to the end
    </div>
  );
}

/** The panel is resizable, so the row height follows the element's real width. */
function useRowHeight(scrollRef: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const measure = (): void => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRef]);
  return cellHeight(width, COLUMNS, GRID_GAP, GRID_PADDING);
}

/** Right-click a page: the one thing worth offering there, in Armory colours. */
function PageContextMenu({ page, anchor, onClose }: { page: number } & ContextMenuState) {
  const api = useViewerApi();
  return (
    <ContextMenu
      anchor={anchor}
      onClose={onClose}
      items={[
        {
          id: 'go-to-page',
          label: `Go to page ${page}`,
          icon: CornerDownRight,
          disabled: api === null,
          run: () => api?.goToPage(page),
        },
      ]}
    />
  );
}

interface ContextMenuState {
  anchor: ContextMenuAnchor;
  onClose(): void;
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

/** The virtualized rows, re-measured whenever the panel is dragged wider. */
function useGridRows(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  pageCount: number,
  rowHeight: number,
  openOn: number
) {
  // eslint-disable-next-line react-hooks/incompatible-library -- library-managed subscription: TanStack Virtual owns the store this reads, and its unmemoized getters are read during render only.
  const virtualizer = useVirtualizer({
    count: Math.ceil(pageCount / COLUMNS),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  // As the panel opens: the selected page is no use out of sight. The offset is
  // set on the element itself — every row is the same height, so it is exact,
  // and writing the same number twice (React's double-invoked effects) is a
  // no-op, where a scroll animation would fight itself.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null || pageCount === 0) return;
    element.scrollTop = gridScrollTop(openOn, COLUMNS, rowHeight, element.clientHeight);
  }, [openOn, pageCount, rowHeight, scrollRef]);

  return virtualizer;
}

export function PageGrid({ session, selection, thumbnails, openOn, ...handlers }: PageGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ page: number; anchor: ContextMenuAnchor } | null>(null);
  const rowHeight = useRowHeight(scrollRef);
  const virtualizer = useGridRows(scrollRef, session.pageCount, rowHeight, openOn);

  const drop = (page: number): void => {
    setDropTarget(null);
    handlers.onDropBefore(page);
  };

  const rows = virtualizer.getVirtualItems().map((row) => (
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
      onContext={(page, event) => {
        event.preventDefault();
        setMenu({ page, anchor: { x: event.clientX, y: event.clientY } });
      }}
      onDragStart={handlers.onDragPage}
      onDragOver={setDropTarget}
      onDrop={drop}
    />
  ));

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {rows}
      </div>
      <EndDropZone
        active={dropTarget === session.pageCount + 1}
        onDragOver={() => setDropTarget(session.pageCount + 1)}
        onDrop={() => drop(session.pageCount + 1)}
      />
      {menu !== null && (
        <PageContextMenu page={menu.page} anchor={menu.anchor} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

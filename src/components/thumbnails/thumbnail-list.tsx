/**
 * The virtualized page rail. Only the thumbnails on screen are drawn, so the
 * rail opens instantly on a 500-page document, and it follows the viewer as it
 * scrolls. Row heights follow the rail's width, so dragging it wider re-lays
 * the run out at the new size instead of leaving gaps.
 *
 * It is also the drop surface for reordering: a drag over a thumbnail shows the
 * line where the pages would land, and the strip under the last page is the
 * "move to the end" target a virtualized list cannot otherwise offer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import type { PageSelection } from '../../features/organize/selection';
import { dropBeforePage } from './rail-selection';
import { EndDropZone } from './rail-drop-zone';
import { ThumbnailItem } from './thumbnail-item';

/** Letter-shaped estimate; each row measures itself once it has drawn. */
function estimatedRow(width: number): number {
  return Math.round(width * 1.294) + 28;
}

export interface ThumbnailListProps {
  document: PDFDocumentProxy | null;
  pageCount: number;
  currentPage: number;
  selection: PageSelection;
  /** How wide a thumbnail may be drawn, from the rail's current width. */
  width: number;
  onSelect(page: number, event: React.MouseEvent): void;
  onContext(page: number, event: React.MouseEvent): void;
  onDragPage(page: number): void;
  /** Drop the dragged pages immediately before this page (pageCount + 1 = end). */
  onDropBefore(page: number): void;
}

function useRailVirtualizer(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  pageCount: number,
  width: number,
  currentPage: number
) {
  // eslint-disable-next-line react-hooks/incompatible-library -- library-managed subscription: TanStack Virtual owns the store this reads, and its unmemoized getters are read during render only.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRow(width),
    overscan: 4,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, width]);

  useEffect(() => {
    virtualizer.scrollToIndex(currentPage - 1, { align: 'auto' });
  }, [currentPage, virtualizer]);

  return virtualizer;
}

/** Which gap the pointer is over, and the handlers that keep it honest. */
function useDropTarget(onDropBefore: (page: number) => void) {
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const gapUnder = (page: number, event: React.DragEvent): number => {
    const box = event.currentTarget.getBoundingClientRect();
    return dropBeforePage(page, event.clientY - box.top, box.height);
  };

  const over = useCallback((page: number, event: React.DragEvent): void => {
    event.preventDefault();
    setDropTarget(gapUnder(page, event));
  }, []);

  const drop = useCallback(
    (page: number, event: React.DragEvent): void => {
      event.preventDefault();
      const gap = gapUnder(page, event);
      setDropTarget(null);
      onDropBefore(gap);
    },
    [onDropBefore]
  );

  const dropAtEnd = useCallback(
    (page: number): void => {
      setDropTarget(null);
      onDropBefore(page);
    },
    [onDropBefore]
  );

  return { dropTarget, setDropTarget, over, drop, dropAtEnd };
}

interface RailRowProps {
  page: number;
  offset: number;
  measure: (element: HTMLDivElement | null) => void;
  item: React.ComponentProps<typeof ThumbnailItem>;
}

/** One absolutely-positioned row. The wrapper is what the virtualizer measures. */
function RailRow({ page, offset, measure, item }: RailRowProps) {
  return (
    <div
      data-index={page - 1}
      ref={measure}
      className="absolute top-0 left-0 w-full"
      style={{ transform: `translateY(${offset}px)` }}
    >
      <ThumbnailItem {...item} />
    </div>
  );
}

export function ThumbnailList({
  document,
  pageCount,
  currentPage,
  selection,
  width,
  ...handlers
}: ThumbnailListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useRailVirtualizer(scrollRef, pageCount, width, currentPage);
  const drop = useDropTarget(handlers.onDropBefore);

  const rowItem = (page: number): React.ComponentProps<typeof ThumbnailItem> => ({
    document,
    page,
    width,
    isCurrent: page === currentPage,
    isSelected: selection.has(page),
    isDropTarget: drop.dropTarget === page,
    onSelect: handlers.onSelect,
    onContext: handlers.onContext,
    onDragStart: handlers.onDragPage,
    onDragOver: drop.over,
    onDrop: drop.drop,
    onDragEnd: () => drop.setDropTarget(null),
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => (
          <RailRow
            key={row.key}
            page={row.index + 1}
            offset={row.start}
            measure={virtualizer.measureElement}
            item={rowItem(row.index + 1)}
          />
        ))}
      </div>
      <EndDropZone
        active={drop.dropTarget === pageCount + 1}
        onOver={() => drop.setDropTarget(pageCount + 1)}
        onDrop={() => drop.dropAtEnd(pageCount + 1)}
      />
    </div>
  );
}

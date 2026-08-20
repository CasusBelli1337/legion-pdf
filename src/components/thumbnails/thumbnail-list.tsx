/**
 * The virtualized page rail. Only the thumbnails on screen are drawn, so the
 * rail opens instantly on a 500-page document, and it follows the viewer as it
 * scrolls. Row heights follow the rail's width, so dragging it wider re-lays
 * the run out at the new size instead of leaving gaps.
 */

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { ThumbnailItem } from './thumbnail-item';

/** Letter-shaped estimate; each row measures itself once it has drawn. */
function estimatedRow(width: number): number {
  return Math.round(width * 1.294) + 28;
}

interface ThumbnailListProps {
  document: PDFDocumentProxy | null;
  pageCount: number;
  currentPage: number;
  /** How wide a thumbnail may be drawn, from the rail's current width. */
  width: number;
  onSelect(page: number): void;
}

export function ThumbnailList({
  document,
  pageCount,
  currentPage,
  width,
  onSelect,
}: ThumbnailListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <ThumbnailItem
              document={document}
              page={item.index + 1}
              width={width}
              isCurrent={item.index + 1 === currentPage}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

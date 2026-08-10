/**
 * The virtualized page rail. Only the thumbnails on screen are drawn, so the
 * rail opens instantly on a 500-page document, and it follows the viewer as it
 * scrolls.
 */

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { THUMB_WIDTH, ThumbnailItem } from './thumbnail-item';

/** Letter-shaped estimate; each row measures itself once it has drawn. */
const ESTIMATED_ROW = Math.round(THUMB_WIDTH * 1.294) + 28;

interface ThumbnailListProps {
  document: PDFDocumentProxy | null;
  pageCount: number;
  currentPage: number;
  onSelect(page: number): void;
}

export function ThumbnailList({ document, pageCount, currentPage, onSelect }: ThumbnailListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW,
    overscan: 4,
  });

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
              isCurrent={item.index + 1 === currentPage}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

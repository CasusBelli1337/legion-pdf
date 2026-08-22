/**
 * The virtualized run of pages. Only the pages near the viewport are in the
 * DOM; each one measures itself so pages of different sizes still land in the
 * right place. The sizing wrapper is at least as wide as the widest page, so a
 * zoomed-in page can be scrolled to sideways instead of being clipped.
 */

import type { Virtualizer } from '@tanstack/react-virtual';
import type { PageSize } from '@shared/types';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import type { PageRoles } from './page-classification';
import { PageView } from './page-view';
import type { PageSizeIndex } from './use-page-sizes';
import type { ViewerController } from './viewer-controller';

/** US Letter, used only until the real page size arrives. */
const FALLBACK_SIZE: PageSize = { width: 612, height: 792 };
const SIDE_GUTTER = 48;

interface PageListProps {
  document: PDFDocumentProxy | null;
  docId: string;
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  sizes: PageSizeIndex;
  zoom: number;
  controller: ViewerController;
  roles: PageRoles;
}

export function PageList({
  document,
  docId,
  virtualizer,
  sizes,
  zoom,
  controller,
  roles,
}: PageListProps) {
  const widest = sizes.sizeOf(1) ?? FALLBACK_SIZE;

  return (
    <div
      className="relative mx-auto"
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: `${Math.round(widest.width * zoom + SIDE_GUTTER)}px`,
        minWidth: '100%',
      }}
    >
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          data-index={item.index}
          ref={virtualizer.measureElement}
          className="absolute top-0 left-0 w-full"
          style={{ transform: `translateY(${item.start}px)` }}
        >
          <PageView
            document={document}
            docId={docId}
            page={item.index + 1}
            size={sizes.sizeOf(item.index + 1) ?? FALLBACK_SIZE}
            zoom={zoom}
            controller={controller}
            roles={roles.rolesFor(item.index + 1)}
          />
        </div>
      ))}
    </div>
  );
}

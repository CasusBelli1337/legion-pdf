/**
 * One page thumbnail. Draws at whatever width the rail has been dragged to,
 * shows a shimmer until it has drawn, and highlights the page the viewer is
 * currently showing. Widening the rail redraws at the new width rather than
 * scaling a small bitmap up, so a wider rail is a sharper picture.
 *
 * Two highlights, two different things: the page the VIEWER is on keeps its
 * outlined frame, and a page the attorney has SELECTED gets a brand-filled
 * number badge and a tinted row. A page can be both at once, and it must still
 * be obvious which is which.
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '../../lib/pdfjs';

/** The rail's default width, used wherever a row height must be guessed. */
export const DEFAULT_THUMB_WIDTH = 140;

export interface ThumbnailDragHandlers {
  onDragStart(page: number): void;
  onDragOver(page: number, event: React.DragEvent): void;
  onDrop(page: number, event: React.DragEvent): void;
  onDragEnd(): void;
}

interface ThumbnailItemProps extends ThumbnailDragHandlers {
  document: PDFDocumentProxy | null;
  page: number;
  width: number;
  isCurrent: boolean;
  isSelected: boolean;
  /** Draw the drop line above this thumbnail. */
  isDropTarget: boolean;
  onSelect(page: number, event: React.MouseEvent): void;
  onContext(page: number, event: React.MouseEvent): void;
}

/** Draws one page at the rail's current width; redraws when either changes. */
function useThumbnail(
  document: PDFDocumentProxy | null,
  page: number,
  width: number,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): boolean {
  const [drawnKey, setDrawnKey] = useState<string | null>(null);
  const key = `${page}:${width}`;

  useEffect(() => {
    if (document === null) return;
    let cancelled = false;

    async function draw(pdf: PDFDocumentProxy): Promise<void> {
      const pdfPage = await pdf.getPage(page);
      const canvas = canvasRef.current;
      if (cancelled || canvas === null) return;
      const scale = width / pdfPage.getViewport({ scale: 1 }).width;
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvas, viewport }).promise;
      if (!cancelled) setDrawnKey(key);
    }

    void draw(document).catch(() => setDrawnKey(null));
    return () => {
      cancelled = true;
    };
    // `key` is page and width together, which is exactly this effect's input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, document, page, width]);

  return drawnKey === key;
}

/**
 * A drag needs payload data or Chromium never starts one; the text is only
 * there to satisfy that rule, since the drop is handled inside this window.
 */
function startDrag(page: number, event: React.DragEvent, begin: (page: number) => void): void {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `page-${page}`);
  begin(page);
}

/** The page number under the picture: a brand badge once the page is selected. */
function PageBadge({ page, isCurrent, isSelected }: Pick<ThumbnailItemProps, 'page'> & Flags) {
  if (isSelected) {
    return (
      <span className="readout rounded-full bg-brand-700 px-1.5 py-0.5 text-text-on-brand">
        {page}
      </span>
    );
  }
  return (
    <span className={`readout ${isCurrent ? 'text-brand-400' : 'text-text-muted'}`}>{page}</span>
  );
}

interface Flags {
  isCurrent: boolean;
  isSelected: boolean;
}

function rowClasses({ isSelected }: Flags): string {
  const base = 'relative flex w-full flex-col items-center gap-1 px-2 py-1.5 transition-colors';
  return `${base} duration-150 ${isSelected ? 'bg-armory-interactive' : ''}`;
}

function ThumbnailItemComponent(props: ThumbnailItemProps) {
  const { document, page, width, isCurrent, isSelected, isDropTarget } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawn = useThumbnail(document, page, width, canvasRef);

  return (
    <button
      type="button"
      draggable
      data-page={page}
      aria-label={`Page ${page}`}
      aria-pressed={isSelected}
      aria-current={isCurrent}
      onClick={(event) => props.onSelect(page, event)}
      onContextMenu={(event) => props.onContext(page, event)}
      onDragStart={(event) => startDrag(page, event, props.onDragStart)}
      onDragOver={(event) => props.onDragOver(page, event)}
      onDrop={(event) => props.onDrop(page, event)}
      onDragEnd={props.onDragEnd}
      className={rowClasses({ isCurrent, isSelected })}
      title={`Go to page ${page}`}
    >
      {isDropTarget && (
        <span
          data-drop-line
          aria-hidden
          className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-brand-500"
        />
      )}
      <span
        className={`relative block overflow-hidden rounded-sm border ${
          isCurrent ? 'border-brand-500 shadow-glow-sm' : 'border-armory-border'
        }`}
        style={{ width: `${width}px` }}
      >
        {/* White is the paper, not a theme colour. */}
        <canvas ref={canvasRef} className="block w-full bg-white" />
        {!isDrawn && <span className="absolute inset-0 animate-pulse bg-armory-elevated" />}
      </span>
      <PageBadge page={page} isCurrent={isCurrent} isSelected={isSelected} />
    </button>
  );
}

export const ThumbnailItem = memo(ThumbnailItemComponent);

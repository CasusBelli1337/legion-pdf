/**
 * One page thumbnail. Draws at whatever width the rail has been dragged to,
 * shows a shimmer until it has drawn, and highlights the page the viewer is
 * currently showing. Widening the rail redraws at the new width rather than
 * scaling a small bitmap up, so a wider rail is a sharper picture.
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '../../lib/pdfjs';

/** The rail's default width, used wherever a row height must be guessed. */
export const DEFAULT_THUMB_WIDTH = 140;

interface ThumbnailItemProps {
  document: PDFDocumentProxy | null;
  page: number;
  width: number;
  isCurrent: boolean;
  onSelect(page: number): void;
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

function ThumbnailItemComponent({
  document,
  page,
  width,
  isCurrent,
  onSelect,
}: ThumbnailItemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawn = useThumbnail(document, page, width, canvasRef);

  return (
    <button
      type="button"
      onClick={() => onSelect(page)}
      aria-current={isCurrent}
      className="flex w-full flex-col items-center gap-1 px-2 py-1.5"
      title={`Go to page ${page}`}
    >
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
      <span className={`readout ${isCurrent ? 'text-brand-400' : 'text-text-muted'}`}>{page}</span>
    </button>
  );
}

export const ThumbnailItem = memo(ThumbnailItemComponent);

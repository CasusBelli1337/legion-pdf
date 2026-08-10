/**
 * One page thumbnail. Draws at a fixed rail width, shows a shimmer until it
 * has drawn, and highlights the page the viewer is currently showing.
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from '../../lib/pdfjs';

export const THUMB_WIDTH = 132;

interface ThumbnailItemProps {
  document: PDFDocumentProxy | null;
  page: number;
  isCurrent: boolean;
  onSelect(page: number): void;
}

function ThumbnailItemComponent({ document, page, isCurrent, onSelect }: ThumbnailItemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawnPage, setDrawnPage] = useState<number | null>(null);
  const isDrawn = drawnPage === page;

  useEffect(() => {
    if (document === null) return;
    let cancelled = false;

    async function draw(pdf: PDFDocumentProxy): Promise<void> {
      const pdfPage = await pdf.getPage(page);
      const canvas = canvasRef.current;
      if (cancelled || canvas === null) return;
      const scale = THUMB_WIDTH / pdfPage.getViewport({ scale: 1 }).width;
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvas, viewport }).promise;
      if (!cancelled) setDrawnPage(page);
    }

    void draw(document).catch(() => setDrawnPage(null));
    return () => {
      cancelled = true;
    };
  }, [document, page]);

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
          isCurrent ? 'border-purple-500 shadow-glow-sm' : 'border-armory-border'
        }`}
        style={{ width: `${THUMB_WIDTH}px` }}
      >
        {/* White is the paper, not a theme colour. */}
        <canvas ref={canvasRef} className="block w-full bg-white" />
        {!isDrawn && <span className="absolute inset-0 animate-pulse bg-armory-elevated" />}
      </span>
      <span className={`readout ${isCurrent ? 'text-purple-400' : 'text-text-muted'}`}>{page}</span>
    </button>
  );
}

export const ThumbnailItem = memo(ThumbnailItemComponent);

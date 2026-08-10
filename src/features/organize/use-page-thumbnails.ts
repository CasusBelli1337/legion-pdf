/**
 * Thumbnail rasters for the page grid: drawn by pdfjs at a low DPI through the
 * shared rasterize helper and cached PER BYTE ARRAY. Keying the cache on the
 * document's current bytes is what makes a stale thumbnail impossible — the
 * moment an operation swaps the bytes, every lookup misses and the grid redraws
 * the file as it now is, rather than showing a picture of a document that no
 * longer exists.
 *
 * Rasters are produced one at a time, and only for the rows the virtualized
 * grid actually asks for, so a 2,000-page document stays cheap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentSession } from '@shared/types';
import { rasterizePage } from '../../lib/rasterize';

/** Small enough to stay cheap on a 2,000-page file, sharp enough to read. */
const THUMBNAIL_DPI = 24;

type RasterCaches = Map<Uint8Array, Map<number, string>>;

export interface PageThumbnails {
  /** Object URL for a page, or undefined while it is still being drawn. */
  urlFor(page: number): string | undefined;
  /** Ask for a page — called by the grid as rows scroll into view. */
  request(page: number): void;
  failed: string | null;
}

/**
 * Draws queued pages one at a time. The cache for this generation of bytes
 * disappearing is the stop signal: it means an operation replaced the document
 * while we were drawing, and these rasters are already wrong.
 */
async function drawQueue(
  source: DocumentSession,
  caches: RasterCaches,
  queue: Set<number>,
  onDrawn: () => void
): Promise<void> {
  while (queue.size > 0 && caches.has(source.bytes)) {
    const page = queue.values().next().value;
    if (page === undefined) return;
    queue.delete(page);
    const raster = await rasterizePage(source.bytes, page, THUMBNAIL_DPI);
    const cache = caches.get(source.bytes);
    if (cache === undefined) return;
    cache.set(
      page,
      URL.createObjectURL(new Blob([raster.png.slice().buffer], { type: 'image/png' }))
    );
    onDrawn();
  }
}

export function usePageThumbnails(session: DocumentSession | null): PageThumbnails {
  const caches = useRef<RasterCaches>(new Map());
  const queue = useRef(new Set<number>());
  const rendering = useRef(false);
  const [, setDrawn] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const bytes = session?.bytes ?? null;

  // On a byte swap (or unmount) the superseded generation's rasters are
  // released, which also stops any draw still running against them.
  useEffect(() => {
    const generation = bytes;
    const allCaches = caches.current;
    const pending = queue.current;
    return () => {
      if (generation === null) return;
      for (const url of allCaches.get(generation)?.values() ?? []) URL.revokeObjectURL(url);
      allCaches.delete(generation);
      pending.clear();
    };
  }, [bytes]);

  const request = useCallback(
    (page: number): void => {
      if (session === null) return;
      const cache = caches.current.get(session.bytes) ?? new Map<number, string>();
      caches.current.set(session.bytes, cache);
      if (cache.has(page) || queue.current.has(page)) return;
      queue.current.add(page);
      if (rendering.current) return;

      rendering.current = true;
      setFailed(null);
      drawQueue(session, caches.current, queue.current, () => setDrawn((drawn) => drawn + 1))
        .catch((error: unknown) =>
          setFailed(error instanceof Error ? error.message : 'A page preview could not be drawn.')
        )
        .finally(() => {
          rendering.current = false;
        });
    },
    [session]
  );

  const urlFor = useCallback(
    (page: number): string | undefined =>
      bytes === null ? undefined : caches.current.get(bytes)?.get(page),
    [bytes]
  );

  return { urlFor, request, failed };
}

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

/**
 * Small enough to stay cheap on a 2,000-page file, sharp enough to read at the
 * WIDEST the tool panel can be dragged (560px, so a ~268px column): a raster
 * below that has to be scaled up, which is what made a widened panel blurry.
 */
const THUMBNAIL_DPI = 36;

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

/** The mutable state one grid's thumbnail run works on. */
interface Runner {
  caches: RasterCaches;
  queue: Set<number>;
  rendering: boolean;
  source: DocumentSession | null;
}

/**
 * Draws whatever is queued, then draws whatever was queued WHILE it drew.
 *
 * That second half is a deadlock fix. An operation swaps the bytes, the run in
 * flight stops because its generation has been retired, and the grid's cells
 * re-request their pages against the new one — but the old run had not finished
 * yet, so those requests only queued, and by the time it did finish there was
 * nothing left to start them. The grid then sat on "Drawing" for ever. It
 * restarts itself here instead.
 */
function drain(
  runner: Runner,
  onDrawn: () => void,
  onFailed: (message: string | null) => void
): void {
  const source = runner.source;
  if (runner.rendering || source === null || runner.queue.size === 0) return;
  // Nothing to draw INTO: the generation has been retired and the grid has not
  // asked for the new one yet. Guards the restart below against spinning.
  if (!runner.caches.has(source.bytes)) return;

  runner.rendering = true;
  onFailed(null);
  drawQueue(source, runner.caches, runner.queue, onDrawn)
    .catch((error: unknown) =>
      onFailed(error instanceof Error ? error.message : 'A page preview could not be drawn.')
    )
    .finally(() => {
      runner.rendering = false;
      drain(runner, onDrawn, onFailed);
    });
}

export function usePageThumbnails(session: DocumentSession | null): PageThumbnails {
  const runner = useRef<Runner>({
    caches: new Map(),
    queue: new Set(),
    rendering: false,
    source: session,
  });
  const [, setDrawn] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const bytes = session?.bytes ?? null;

  const pump = useCallback(() => {
    drain(runner.current, () => setDrawn((drawn) => drawn + 1), setFailed);
  }, []);

  // On a byte swap (or unmount) the superseded generation's rasters are
  // released, which also stops any draw still running against them.
  useEffect(() => {
    const generation = bytes;
    const { caches, queue } = runner.current;
    return () => {
      if (generation === null) return;
      for (const url of caches.get(generation)?.values() ?? []) URL.revokeObjectURL(url);
      caches.delete(generation);
      queue.clear();
    };
  }, [bytes]);

  // Pumping here as well covers a swap with nothing in flight: the cells
  // re-request during their own effects, which React runs BEFORE this one.
  useEffect(() => {
    runner.current.source = session;
    pump();
  }, [pump, session]);

  const request = useCallback(
    (page: number): void => {
      if (session === null) return;
      const { caches, queue } = runner.current;
      const cache = caches.get(session.bytes) ?? new Map<number, string>();
      caches.set(session.bytes, cache);
      if (cache.has(page) || queue.has(page)) return;
      queue.add(page);
      pump();
    },
    [pump, session]
  );

  const urlFor = useCallback(
    (page: number): string | undefined =>
      bytes === null ? undefined : runner.current.caches.get(bytes)?.get(page),
    [bytes]
  );

  return { urlFor, request, failed };
}

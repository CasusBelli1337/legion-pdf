/**
 * The worker pool. One Tesseract process per core is the point of local OCR —
 * a 214-page scan should saturate the machine, not trickle through one at a
 * time. The pool itself owns no Tesseract knowledge: it hands out queued items
 * to N concurrent workers, stops on the first failure, and drains on cancel.
 *
 * Failure is deliberately fail-fast and loud. A half-OCR'd document that
 * reports success is the exact failure this codebase refuses to ship.
 */

import { OcrCancelledError } from './tesseract-cli';

/** More than this many concurrent Tesseract processes buys nothing but RAM. */
export const MAX_OCR_WORKERS = 16;

/** CPU count, clamped — and overridable by the caller's `workers` option. */
export function poolSize(cpuCount: number, requested?: number): number {
  const wanted = requested !== undefined && requested > 0 ? requested : cpuCount;
  const usable = Number.isFinite(wanted) ? Math.floor(wanted) : 1;
  return Math.min(MAX_OCR_WORKERS, Math.max(1, usable));
}

/** Throws if the run has been cancelled — call before starting real work. */
export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new OcrCancelledError();
}

/**
 * Run `worker` over every item with at most `concurrency` in flight. Results
 * keep the input order. The first rejection stops the queue and is rethrown
 * once every in-flight worker has settled, so nothing is left dangling.
 */
export async function runPool<I, O>(
  items: readonly I[],
  concurrency: number,
  worker: (item: I, index: number) => Promise<O>,
  signal?: AbortSignal
): Promise<O[]> {
  const queue = items.map((item, index) => ({ item, index }));
  const results = new Array<O>(items.length);
  let cursor = 0;
  let failure: unknown = null;

  const runner = async (): Promise<void> => {
    while (failure === null) {
      if (signal?.aborted === true) {
        failure ??= new OcrCancelledError();
        return;
      }
      const job = queue[cursor];
      cursor += 1;
      if (job === undefined) return;
      try {
        results[job.index] = await worker(job.item, job.index);
      } catch (error) {
        failure ??= error;
        return;
      }
    }
  };

  const width = Math.min(Math.max(1, concurrency), Math.max(1, queue.length));
  await Promise.all(Array.from({ length: width }, () => runner()));
  if (failure !== null) throw failure;
  if (results.length !== items.length) {
    throw new Error(`The OCR pool returned ${results.length} results for ${items.length} pages.`);
  }
  return results;
}

import { describe, expect, it } from 'vitest';
import { MAX_OCR_WORKERS, poolSize, runPool, throwIfCancelled } from './pool';
import { OcrCancelledError } from './tesseract-cli';

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** A worker that records how many calls were ever in flight at the same time. */
function trackingWorker(delayTicks = 1) {
  const state = { inFlight: 0, peak: 0, started: [] as number[] };
  const worker = async (item: number): Promise<number> => {
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    state.started.push(item);
    for (let tick = 0; tick < delayTicks; tick += 1) await Promise.resolve();
    state.inFlight -= 1;
    return item * 2;
  };
  return { state, worker };
}

describe('poolSize', () => {
  it('uses every core by default', () => {
    expect(poolSize(24)).toBe(16);
    expect(poolSize(8)).toBe(8);
  });

  it('never exceeds the cap, however many cores the machine has', () => {
    expect(poolSize(96)).toBe(MAX_OCR_WORKERS);
    expect(poolSize(4, 64)).toBe(MAX_OCR_WORKERS);
  });

  it('honours an explicit worker count', () => {
    expect(poolSize(24, 4)).toBe(4);
  });

  it('falls back to the core count when the request makes no sense', () => {
    expect(poolSize(8, 0)).toBe(8);
    expect(poolSize(8, -3)).toBe(8);
  });

  it('never drops below one worker', () => {
    expect(poolSize(0)).toBe(1);
    expect(poolSize(Number.NaN)).toBe(1);
    expect(poolSize(0.4)).toBe(1);
  });
});

describe('runPool', () => {
  it('returns one result per item, in input order', async () => {
    const { worker } = trackingWorker();
    const results = await runPool([1, 2, 3, 4, 5], 2, worker);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('saturates the pool: concurrency workers run at once', async () => {
    const { state, worker } = trackingWorker(3);
    await runPool([1, 2, 3, 4, 5, 6, 7, 8], 4, worker);
    expect(state.peak).toBe(4);
  });

  it('never exceeds the requested concurrency', async () => {
    const { state, worker } = trackingWorker(5);
    await runPool(
      Array.from({ length: 40 }, (_value, index) => index),
      3,
      worker
    );
    expect(state.peak).toBeLessThanOrEqual(3);
  });

  it('does not start more workers than there are pages', async () => {
    const { state, worker } = trackingWorker(3);
    await runPool([1, 2], 16, worker);
    expect(state.peak).toBe(2);
  });

  it('fails the whole run loudly when one page throws', async () => {
    const failing = async (item: number): Promise<number> => {
      if (item === 3) throw new Error('Tesseract exited with code 1 on page 3');
      return item;
    };
    await expect(runPool([1, 2, 3, 4], 2, failing)).rejects.toThrow(/code 1 on page 3/);
  });

  it('stops handing out work after a failure instead of grinding on', async () => {
    const attempted: number[] = [];
    const failing = async (item: number): Promise<number> => {
      attempted.push(item);
      await Promise.resolve();
      if (item === 1) throw new Error('spawn ENOENT');
      return item;
    };
    await expect(runPool([1, 2, 3, 4, 5, 6, 7, 8], 2, failing)).rejects.toThrow(/ENOENT/);
    expect(attempted.length).toBeLessThan(8);
  });

  it('waits for in-flight work to settle before rejecting', async () => {
    const slow = deferred<number>();
    let settled = false;
    const worker = async (item: number): Promise<number> => {
      if (item === 1) {
        const value = await slow.promise;
        settled = true;
        return value;
      }
      throw new Error('page 2 failed');
    };
    const run = runPool([1, 2], 2, worker);
    slow.resolve(7);
    await expect(run).rejects.toThrow(/page 2 failed/);
    expect(settled).toBe(true);
  });

  it('cancels: the queue drains and the run rejects', async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    const worker = async (item: number): Promise<number> => {
      seen.push(item);
      if (seen.length === 2) controller.abort();
      await Promise.resolve();
      return item;
    };
    await expect(runPool([1, 2, 3, 4, 5, 6], 2, worker, controller.signal)).rejects.toBeInstanceOf(
      OcrCancelledError
    );
    expect(seen.length).toBeLessThan(6);
  });

  it('refuses to start at all when cancelled up front', async () => {
    const controller = new AbortController();
    controller.abort();
    const { state, worker } = trackingWorker();
    await expect(runPool([1, 2, 3], 2, worker, controller.signal)).rejects.toBeInstanceOf(
      OcrCancelledError
    );
    expect(state.started).toEqual([]);
  });

  it('handles an empty queue without hanging', async () => {
    expect(await runPool([], 4, async (item: number) => item)).toEqual([]);
  });
});

describe('throwIfCancelled', () => {
  it('does nothing while the run is live', () => {
    expect(() => throwIfCancelled(new AbortController().signal)).not.toThrow();
    expect(() => throwIfCancelled(undefined)).not.toThrow();
  });

  it('throws once the run is cancelled', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfCancelled(controller.signal)).toThrow(OcrCancelledError);
  });
});

/**
 * Bulk orchestration with the OCR service faked out: order, per-file isolation,
 * cancellation, the overwrite refusal, and the promise that the receipt
 * accounts for every input path.
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  OcrDetectResult,
  OcrOptions,
  OcrRunDetail,
  OpResult,
  ProgressEvent,
} from '@shared/types';
import { BulkOcrRunner, bulkOutputPath } from './bulk-ocr';
import type { BulkOcrDeps } from './bulk-ocr';
import type { OcrProgress } from './ocr-service';

const OPTIONS = { overwrite: false };

function detectResult(pageCount: number, needing: number[]): OcrDetectResult {
  const all = Array.from({ length: pageCount }, (_value, index) => index + 1);
  return {
    pageCount,
    pagesNeedingOcr: needing,
    pagesWithText: all.filter((page) => !needing.includes(page)),
  };
}

function runDetail(pages: readonly number[]): OpResult<OcrRunDetail> {
  return {
    bytes: new Uint8Array([1, 2, 3, 4]),
    pagesIn: pages.length,
    pagesOut: pages.length,
    detail: {
      pagesOcred: [...pages],
      charsPerPage: pages.map(() => 40),
      wordsPerPage: pages.map(() => 7),
    },
  };
}

interface Harness {
  runner: BulkOcrRunner;
  deps: BulkOcrDeps;
  progress: ProgressEvent[];
  /** Everything the run put on disk, keyed by path — the count check. */
  written: Map<string, Uint8Array>;
  /** Store documents currently open; must be empty when a run ends. */
  openDocs: Set<string>;
}

function harness(overrides: Partial<BulkOcrDeps> = {}, existing: string[] = []): Harness {
  const progress: ProgressEvent[] = [];
  const written = new Map<string, Uint8Array>();
  const openDocs = new Set<string>();
  let nextId = 0;

  const deps: BulkOcrDeps = {
    readFile: vi.fn(async (path: string) => new Uint8Array([path.length])),
    adopt: vi.fn(async () => {
      nextId += 1;
      const docId = `doc-${nextId}`;
      openDocs.add(docId);
      return docId;
    }),
    closeDoc: vi.fn((docId: string) => {
      openDocs.delete(docId);
    }),
    detect: vi.fn(async () => detectResult(3, [1, 2, 3])),
    runOcr: vi.fn(
      async (
        _docId: string,
        _bytes: Uint8Array,
        options: OcrOptions,
        onProgress: (progress: OcrProgress) => void
      ) => {
        options.pages.forEach((_page, index) =>
          onProgress({
            docId: 'ignored',
            phase: 'Recognizing text',
            current: index + 1,
            total: options.pages.length,
          })
        );
        return runDetail(options.pages);
      }
    ),
    writeOutput: vi.fn(async (path: string, bytes: Uint8Array) => {
      written.set(path, bytes);
    }),
    exists: vi.fn(async (path: string) => existing.includes(path) || written.has(path)),
    emitProgress: vi.fn((event: ProgressEvent) => {
      progress.push(event);
    }),
    ...overrides,
  };

  return { runner: new BulkOcrRunner(deps), deps, progress, written, openDocs };
}

describe('bulkOutputPath', () => {
  it('writes beside the input by default, under a new name', () => {
    expect(bulkOutputPath('/matters/ashford/deposition.pdf')).toBe(
      '/matters/ashford/deposition (searchable).pdf'
    );
  });

  it('writes into the chosen folder when there is one', () => {
    expect(bulkOutputPath('/matters/ashford/deposition.pdf', '/matters/searchable')).toBe(
      '/matters/searchable/deposition (searchable).pdf'
    );
  });

  it('can never name the input file, so the original is always safe', () => {
    const input = '/matters/a (searchable).pdf';
    expect(bulkOutputPath(input)).not.toBe(input);
  });
});

describe('BulkOcrRunner.run', () => {
  it('OCRs every file and reports one entry per input, in request order', async () => {
    const { runner, written } = harness();
    const result = await runner.run(['/in/b.pdf', '/in/a.pdf', '/in/c.pdf'], OPTIONS);

    expect(result.files.map((file) => file.path)).toEqual(['/in/b.pdf', '/in/a.pdf', '/in/c.pdf']);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect([...written.keys()]).toEqual([
      '/in/b (searchable).pdf',
      '/in/a (searchable).pdf',
      '/in/c (searchable).pdf',
    ]);
  });

  it('counts the pages and words it actually recognized', async () => {
    const { runner } = harness();
    const result = await runner.run(['/in/a.pdf'], OPTIONS);

    expect(result.files[0]).toEqual({
      path: '/in/a.pdf',
      outputPath: '/in/a (searchable).pdf',
      pages: 3,
      words: 21,
      status: 'done',
    });
  });

  it('recognizes only the pages that have no text layer', async () => {
    const { runner, deps } = harness({ detect: vi.fn(async () => detectResult(5, [2, 4])) });
    const result = await runner.run(['/in/mixed.pdf'], OPTIONS);

    expect(deps.runOcr).toHaveBeenCalledWith(
      'doc-1',
      expect.anything(),
      { pages: [2, 4], language: 'eng', dpi: 300 },
      expect.any(Function)
    );
    expect(result.files[0]?.pages).toBe(2);
  });

  it('leaves an already-searchable file alone, and says so in the receipt', async () => {
    const { runner, deps, written } = harness({ detect: vi.fn(async () => detectResult(4, [])) });
    const result = await runner.run(['/in/typed.pdf'], OPTIONS);

    expect(deps.runOcr).not.toHaveBeenCalled();
    expect(written.size).toBe(0);
    expect(result.files[0]).toEqual({
      path: '/in/typed.pdf',
      outputPath: null,
      pages: 0,
      words: 0,
      status: 'done',
    });
    expect(result.succeeded).toBe(1);
  });

  it('keeps going when one file fails, and names the one that broke', async () => {
    const runOcr = vi.fn(async (docId: string, _bytes: Uint8Array, options: OcrOptions) => {
      if (docId === 'doc-2') throw new Error('Tesseract exited with code 1');
      return runDetail(options.pages);
    });
    const { runner, written } = harness({ runOcr });

    const result = await runner.run(['/in/a.pdf', '/in/b.pdf', '/in/c.pdf'], OPTIONS);

    expect(result.files.map((file) => file.status)).toEqual(['done', 'failed', 'done']);
    expect(result.files[1]?.error).toBe('Tesseract exited with code 1');
    expect(result.files[1]?.outputPath).toBeNull();
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect([...written.keys()]).toEqual(['/in/a (searchable).pdf', '/in/c (searchable).pdf']);
  });

  it('closes the store document for a file that failed', async () => {
    const { runner, openDocs } = harness({
      runOcr: vi.fn(async () => {
        throw new Error('spawn ENOENT');
      }),
    });

    await runner.run(['/in/a.pdf'], OPTIONS);
    expect(openDocs.size).toBe(0);
  });

  it('closes every store document it opened', async () => {
    const { runner, openDocs, deps } = harness();
    await runner.run(['/in/a.pdf', '/in/b.pdf'], OPTIONS);
    expect(deps.closeDoc).toHaveBeenCalledTimes(2);
    expect(openDocs.size).toBe(0);
  });

  it('refuses a file whose output is already there, and OCRs nothing for it', async () => {
    const { runner, deps } = harness({}, ['/in/a (searchable).pdf']);
    const result = await runner.run(['/in/a.pdf'], OPTIONS);

    expect(result.files[0]?.status).toBe('failed');
    expect(result.files[0]?.error).toMatch(/already exists/);
    expect(deps.runOcr).not.toHaveBeenCalled();
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it('replaces an existing output when the attorney asked for that', async () => {
    const { runner, written } = harness({}, ['/in/a (searchable).pdf']);
    const result = await runner.run(['/in/a.pdf'], { overwrite: true });

    expect(result.files[0]?.status).toBe('done');
    expect(written.has('/in/a (searchable).pdf')).toBe(true);
  });

  it('writes into the chosen output folder', async () => {
    const { runner, written } = harness();
    await runner.run(['/in/a.pdf'], { overwrite: false, outputDir: '/out' });
    expect([...written.keys()]).toEqual(['/out/a (searchable).pdf']);
  });

  it('marks the files it never reached as cancelled and keeps the finished ones', async () => {
    const harnessed = harness();
    const { runner, written } = harnessed;
    vi.mocked(harnessed.deps.runOcr).mockImplementation(
      async (_docId: string, _bytes: Uint8Array, options: OcrOptions) => {
        runner.cancel();
        return runDetail(options.pages);
      }
    );

    const result = await runner.run(['/in/a.pdf', '/in/b.pdf', '/in/c.pdf'], OPTIONS);

    expect(result.files.map((file) => file.status)).toEqual(['done', 'cancelled', 'cancelled']);
    expect(result.files[1]?.outputPath).toBeNull();
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect([...written.keys()]).toEqual(['/in/a (searchable).pdf']);
  });

  it('ignores a cancel when nothing is running', async () => {
    const { runner } = harness();
    runner.cancel();
    const result = await runner.run(['/in/a.pdf'], OPTIONS);
    expect(result.files[0]?.status).toBe('done');
  });

  it('streams progress with no docId, naming the file and the page', async () => {
    const { runner, progress } = harness({ detect: vi.fn(async () => detectResult(2, [1, 2])) });
    await runner.run(['/in/a.pdf', '/in/b.pdf'], OPTIONS);

    expect(progress.every((event) => event.docId === null)).toBe(true);
    expect(progress.every((event) => event.total === 2)).toBe(true);
    expect(progress.map((event) => event.phase)).toEqual([
      'a.pdf — checking the pages',
      'a.pdf — page 1 of 2',
      'a.pdf — page 2 of 2',
      'a.pdf — saving the searchable copy',
      'b.pdf — checking the pages',
      'b.pdf — page 1 of 2',
      'b.pdf — page 2 of 2',
      'b.pdf — saving the searchable copy',
    ]);
    expect(progress.map((event) => event.current)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
  });

  it('fails a file whose recognition covered fewer pages than it claimed to need', async () => {
    const { runner, written } = harness({
      runOcr: vi.fn(async () => runDetail([1])),
      detect: vi.fn(async () => detectResult(3, [1, 2, 3])),
    });

    const result = await runner.run(['/in/a.pdf'], OPTIONS);

    expect(result.files[0]?.status).toBe('failed');
    expect(result.files[0]?.error).toMatch(/covered 1 of the 3 pages/);
    expect(written.size).toBe(0);
  });

  it('refuses to write an empty result', async () => {
    const { runner, written } = harness({
      runOcr: vi.fn(async (_docId: string, _bytes: Uint8Array, options: OcrOptions) => ({
        ...runDetail(options.pages),
        bytes: new Uint8Array(0),
      })),
    });

    const result = await runner.run(['/in/a.pdf'], OPTIONS);
    expect(result.files[0]?.status).toBe('failed');
    expect(result.files[0]?.error).toMatch(/empty document/);
    expect(written.size).toBe(0);
  });

  it('refuses an empty file list rather than reporting an empty success', async () => {
    const { runner } = harness();
    await expect(runner.run([], OPTIONS)).rejects.toThrow(/No files were chosen/);
  });

  it('refuses a second run while one is going', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runner } = harness({
      runOcr: vi.fn(async (_docId: string, _bytes: Uint8Array, options: OcrOptions) => {
        await gate;
        return runDetail(options.pages);
      }),
    });

    const first = runner.run(['/in/a.pdf'], OPTIONS);
    await expect(runner.run(['/in/b.pdf'], OPTIONS)).rejects.toThrow(/already running/);
    release();
    await first;
  });

  it('can run again after the previous run finished', async () => {
    const { runner } = harness();
    await runner.run(['/in/a.pdf'], OPTIONS);
    const second = await runner.run(['/in/b.pdf'], OPTIONS);
    expect(second.succeeded).toBe(1);
  });
});

/**
 * The whole export pipeline, driven with a fake renderer and a fake disk. What
 * these prove is the "silent data loss" half of the lane: the files that were
 * promised exist, are named what the receipt says, and a run that stopped early
 * fails loudly instead of reporting a short result as a success.
 */

import { describe, expect, it, vi } from 'vitest';
import { countTiffPages } from '@core/image';
import { encodeRgbPng } from '@core/redact';
import type { ExportFormat, ExportOptions, ProgressEvent } from '@shared/types';
import { ExportRunner } from './export-runner';
import type { ExportRunnerDeps } from './export-runner';
import type { Exporter, ExporterContext, TextSource } from './exporter';
import { isExportCancelled } from './cancellation';

const FOLDER = '/out/images';
const FILE_NAME = 'Ashford Deposition.pdf';
const PAGE_COUNT = 3;

/** A real PNG, so the grayscale and TIFF paths decode something genuine. */
function pagePng(page: number): Uint8Array {
  const widthPx = 8;
  const heightPx = 6;
  const rgb = new Uint8Array(widthPx * heightPx * 3);
  for (let index = 0; index < rgb.length; index += 1) {
    rgb[index] = (index * 5 + page * 40) % 256;
  }
  return encodeRgbPng({ widthPx, heightPx, rgb });
}

interface Harness {
  runner: ExportRunner;
  disk: Map<string, Uint8Array>;
  progress: ProgressEvent[];
  rastered: number[];
}

interface HarnessOptions {
  pageText?: (page: number) => string;
  onRaster?: (page: number) => void;
  exporters?: Record<ExportFormat, Exporter>;
  sizeOf?: (path: string) => Promise<number>;
}

function harness(options: HarnessOptions = {}): Harness {
  const disk = new Map<string, Uint8Array>();
  const progress: ProgressEvent[] = [];
  const rastered: number[] = [];

  const source: TextSource = {
    pageText: (page) => Promise.resolve(options.pageText?.(page) ?? `Words on page ${page}.`),
    close: () => Promise.resolve(),
  };

  const context: ExporterContext = {
    requestRaster: ({ page }) => {
      rastered.push(page);
      options.onRaster?.(page);
      return Promise.resolve({ png: pagePng(page), widthPx: 8, heightPx: 6 });
    },
    toJpeg: (png, quality) => new TextEncoder().encode(`JPEG q${quality} of ${png.byteLength}`),
    openText: () => Promise.resolve(source),
    writeFile: (path, bytes) => {
      if (bytes.byteLength === 0) throw new Error(`Refusing to write an empty file to ${path}.`);
      disk.set(path, bytes);
      return Promise.resolve();
    },
    exists: (path) => Promise.resolve(disk.has(path)),
  };

  const deps: ExportRunnerDeps = {
    context,
    bytesOf: () => new Uint8Array([1, 2, 3]),
    fileNameOf: () => FILE_NAME,
    pageCountOf: () => PAGE_COUNT,
    emitProgress: (event) => progress.push(event),
    sizeOf: options.sizeOf ?? ((path) => Promise.resolve(disk.get(path)?.byteLength ?? 0)),
  };
  if (options.exporters !== undefined) deps.exporters = options.exporters;
  return { runner: new ExportRunner(deps), disk, progress, rastered };
}

function options(format: ExportFormat, extra: Partial<ExportOptions> = {}): ExportOptions {
  const base: ExportOptions =
    format === 'png' || format === 'jpeg'
      ? { format, outputPath: FOLDER }
      : { format, outputPath: `/out/${format}-export.${format}` };
  return { ...base, ...extra };
}

describe('png and jpeg exports', () => {
  it('writes one file per page, zero-padded, and streams a tick for each', async () => {
    const { runner, disk, progress } = harness();
    const result = await runner.run('doc-1', options('png'));

    expect(result.files).toEqual([
      `${FOLDER}/Ashford Deposition-page-001.png`,
      `${FOLDER}/Ashford Deposition-page-002.png`,
      `${FOLDER}/Ashford Deposition-page-003.png`,
    ]);
    expect(result.pagesExported).toBe(3);
    expect([...disk.keys()]).toEqual(result.files);
    expect(progress.map((event) => `${event.phase} ${event.current}/${event.total}`)).toEqual([
      'Exporting 1/3',
      'Exporting 2/3',
      'Exporting 3/3',
    ]);
  });

  it('honours a page range and names files by their real page number', async () => {
    const { runner, rastered } = harness();
    const result = await runner.run('doc-1', options('png', { pages: '2-3' }));
    expect(result.files).toEqual([
      `${FOLDER}/Ashford Deposition-page-002.png`,
      `${FOLDER}/Ashford Deposition-page-003.png`,
    ]);
    expect(rastered).toEqual([2, 3]);
  });

  it('never overwrites an existing batch — it moves the whole set aside', async () => {
    const { runner, disk } = harness();
    disk.set(`${FOLDER}/Ashford Deposition-page-002.png`, new Uint8Array([9]));

    const result = await runner.run('doc-1', options('png'));
    expect(result.files[0]).toBe(`${FOLDER}/Ashford Deposition (2)-page-001.png`);
    expect(result.notes[0]).toMatch(/already in that folder/);
    expect(disk.get(`${FOLDER}/Ashford Deposition-page-002.png`)).toEqual(new Uint8Array([9]));
  });

  it('writes JPEGs at the requested quality', async () => {
    const { runner, disk } = harness();
    const result = await runner.run('doc-1', options('jpeg', { quality: 60 }));
    expect(result.files[0]).toBe(`${FOLDER}/Ashford Deposition-page-001.jpg`);
    const first = disk.get(result.files[0] ?? '');
    expect(new TextDecoder().decode(first)).toMatch(/^JPEG q60 /);
  });

  it('refuses a resolution or quality the app does not export at', async () => {
    const { runner } = harness();
    await expect(runner.run('doc-1', options('png', { dpi: 5000 }))).rejects.toThrow(/36-1200/);
    await expect(runner.run('doc-1', options('jpeg', { quality: 0 }))).rejects.toThrow(
      /between 1 and 100/
    );
  });
});

describe('tiff export', () => {
  it('writes ONE file holding every page', async () => {
    const { runner, disk } = harness();
    const result = await runner.run('doc-1', options('tiff'));
    expect(result.files).toHaveLength(1);
    const tiff = disk.get(result.files[0] ?? '');
    expect(tiff).toBeDefined();
    expect(countTiffPages(tiff ?? new Uint8Array())).toBe(3);
  });

  it('black and white is the smallest of the three colour treatments', async () => {
    const sizes = new Map<string, number>();
    for (const color of ['color', 'grayscale', 'bw'] as const) {
      const { runner, disk } = harness();
      const result = await runner.run('doc-1', options('tiff', { color }));
      sizes.set(color, disk.get(result.files[0] ?? '')?.byteLength ?? 0);
    }
    expect(sizes.get('bw')).toBeLessThan(sizes.get('grayscale') ?? 0);
    expect(sizes.get('grayscale')).toBeLessThan(sizes.get('color') ?? 0);
  });
});

describe('plain text export', () => {
  it('separates pages by header and form feed', async () => {
    const { runner, disk } = harness();
    const result = await runner.run('doc-1', options('txt'));
    const text = new TextDecoder().decode(disk.get(result.files[0] ?? ''));
    expect(text).toContain('----- Page 1 -----');
    expect(text).toContain('----- Page 3 -----');
    expect(text.split('\f')).toHaveLength(3);
    expect(text).toContain('Words on page 2.');
  });

  it('refuses to write a text file for a document that is all pictures', async () => {
    const { runner, disk } = harness({ pageText: () => '   ' });
    await expect(runner.run('doc-1', options('txt'))).rejects.toThrow(/Run Text Recognition/);
    expect(disk.size).toBe(0);
  });

  it('notes the pages that had nothing on them', async () => {
    const { runner } = harness({ pageText: (page) => (page === 2 ? '' : `Page ${page}`) });
    const result = await runner.run('doc-1', options('txt'));
    expect(result.notes[0]).toMatch(/1 of the 3 pages had no text/);
  });
});

describe('page ranges and formats that are not built yet', () => {
  it('throws on a range that selects nothing', async () => {
    const { runner } = harness();
    await expect(runner.run('doc-1', options('png', { pages: ',' }))).rejects.toThrow(
      /selects no pages/
    );
  });

  it('throws on a range that runs off the end of the document', async () => {
    const { runner } = harness();
    await expect(runner.run('doc-1', options('png', { pages: '2-9' }))).rejects.toThrow(
      /ends at page 3/
    );
  });

  it('rejects Word by name until that lane lands', async () => {
    const { runner } = harness();
    await expect(runner.run('doc-1', options('docx'))).rejects.toThrow(
      'NotImplemented: export docx'
    );
  });

  it('refuses to start without somewhere to save', async () => {
    const { runner } = harness();
    await expect(runner.run('doc-1', { format: 'png', outputPath: '  ' })).rejects.toThrow(
      /Choose where to save/
    );
  });
});

describe('cancelling', () => {
  it('stops after the page in flight, keeps what was written, and fails loudly', async () => {
    let runner: ExportRunner | null = null;
    const bench = harness({
      onRaster: (page) => {
        if (page === 2) runner?.cancel('doc-1');
      },
    });
    runner = bench.runner;

    const failure = await runner.run('doc-1', options('png')).catch((error: unknown) => error);
    expect(isExportCancelled(failure)).toBe(true);
    expect((failure as Error).message).toBe('Export was stopped after page 2. 2 files were kept.');
    expect(bench.disk.size).toBe(2);
  });

  it('cancelling a TIFF keeps no half-written file', async () => {
    let runner: ExportRunner | null = null;
    const bench = harness({
      onRaster: (page) => {
        if (page === 2) runner?.cancel('doc-1');
      },
    });
    runner = bench.runner;
    await expect(runner.run('doc-1', options('tiff'))).rejects.toThrow(/No file was written/);
    expect(bench.disk.size).toBe(0);
  });
});

describe('the count-verification gate', () => {
  it('rejects an exporter that reported more pages than it covered', async () => {
    const lying: Exporter = (job) =>
      Promise.resolve({
        format: 'png',
        files: job.pages.map((page) => `${FOLDER}/fake-${page}.png`),
        pagesExported: 99,
        notes: [],
      });
    const { runner } = harness({
      exporters: { png: lying, jpeg: lying, tiff: lying, txt: lying, docx: lying },
      sizeOf: () => Promise.resolve(10),
    });
    await expect(runner.run('doc-1', options('png'))).rejects.toThrow(/covered 99 of the 3 pages/);
  });

  it('rejects a per-page export that came up short on files', async () => {
    const short: Exporter = (job) =>
      Promise.resolve({
        format: 'png',
        files: [`${FOLDER}/only-one.png`],
        pagesExported: job.pages.length,
        notes: [],
      });
    const { runner } = harness({
      exporters: { png: short, jpeg: short, tiff: short, txt: short, docx: short },
      sizeOf: () => Promise.resolve(10),
    });
    await expect(runner.run('doc-1', options('png'))).rejects.toThrow(/1 file where 3 were due/);
  });

  it('rejects a file that landed on disk empty', async () => {
    const { runner } = harness({ sizeOf: () => Promise.resolve(0) });
    await expect(runner.run('doc-1', options('tiff'))).rejects.toThrow(/written but is empty/);
  });

  it('refuses to run two exports of the same document at once', async () => {
    const slow = vi.fn();
    const bench = harness({ onRaster: () => slow() });
    const first = bench.runner.run('doc-1', options('tiff'));
    await expect(bench.runner.run('doc-1', options('png'))).rejects.toThrow(
      /already being exported/
    );
    await first;
  });
});

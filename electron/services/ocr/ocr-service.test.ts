/**
 * The orchestration, with the raster round-trip and the Tesseract runner both
 * faked: progress streaming, cancellation, loud failure, blank-page handling,
 * and temp cleanup. The real binary is exercised in `tesseract-e2e.test.ts`.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { EmptyOcrPageError, detectTextLayer } from '@core/ocr';
import { blankPng, inkedPng } from '@core/ocr/png-fixture.testkit';
import { OcrService } from './ocr-service';
import type { OcrProgress, OcrServiceDeps } from './ocr-service';
import { OcrCancelledError } from './tesseract-cli';

const WIDTH = 255;
const HEIGHT = 330;

function hocrWith(words: string[]): string {
  const spans = words
    .map(
      (text, index) =>
        `<span class='ocrx_word' id='word_1_${index}' title='bbox ${20 + index * 40} 30 ${
          55 + index * 40
        } 45; x_wconf 94'>${text}</span>`
    )
    .join('\n');
  return `<div class='ocr_page' id='page_1' title='image "p.png"; bbox 0 0 ${WIDTH} ${HEIGHT}'>
    <span class='ocr_line' title='bbox 20 30 400 45'>${spans}</span>
  </div>`;
}

const EMPTY_HOCR = `<div class='ocr_page' title='bbox 0 0 ${WIDTH} ${HEIGHT}'></div>`;

async function threePagePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let index = 0; index < 3; index += 1) document.addPage([612, 792]);
  return document.save();
}

interface Harness {
  service: OcrService;
  progress: OcrProgress[];
  tempRoot: string;
  runHocr: ReturnType<typeof vi.fn>;
  requestRaster: ReturnType<typeof vi.fn>;
}

let harnesses: string[] = [];

async function harness(overrides: Partial<OcrServiceDeps> = {}): Promise<Harness> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'librarius-ocr-test-'));
  harnesses.push(tempRoot);
  const progress: OcrProgress[] = [];
  const requestRaster = vi.fn(async () => ({
    requestId: 'r',
    png: inkedPng(WIDTH, HEIGHT),
    widthPx: WIDTH,
    heightPx: HEIGHT,
  }));
  const runHocr = vi.fn(async () => hocrWith(['CONFIDENTIAL', 'EXHIBIT']));
  const service = new OcrService({
    requestRaster,
    emitProgress: (event) => progress.push(event),
    locate: () => ({ command: '/fake/tesseract', source: 'bundled', tessdataPrefix: null }),
    cpuCount: () => 4,
    tempRoot,
    runHocr,
    ...overrides,
  });
  return { service, progress, tempRoot, runHocr, requestRaster };
}

beforeEach(() => {
  harnesses = [];
});

afterEach(async () => {
  for (const root of harnesses) await rm(root, { recursive: true, force: true });
});

const OPTIONS = { pages: [1, 2], language: 'eng', dpi: 300 };

describe('OcrService.detect', () => {
  it('reports every page of a scan as needing text recognition', async () => {
    const { service } = await harness();
    const result = await service.detect(await threePagePdf());
    expect(result).toEqual({ pageCount: 3, pagesWithText: [], pagesNeedingOcr: [1, 2, 3] });
  });
});

describe('OcrService.run', () => {
  it('writes a text layer the detector can then see', async () => {
    const { service } = await harness();
    const result = await service.run('doc-1', await threePagePdf(), OPTIONS);

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(3);
    expect(result.detail.pagesOcred).toEqual([1, 2]);
    expect(result.detail.charsPerPage).toEqual([19, 19]);
    const after = await detectTextLayer(result.bytes);
    expect(after.pagesWithText).toEqual([1, 2]);
    expect(after.pagesNeedingOcr).toEqual([3]);
  });

  it('asks the renderer for a raster of each page at the requested DPI', async () => {
    const { service, requestRaster } = await harness();
    await service.run('doc-1', await threePagePdf(), { ...OPTIONS, dpi: 400 });
    expect(requestRaster).toHaveBeenCalledTimes(2);
    expect(requestRaster).toHaveBeenCalledWith({ docId: 'doc-1', page: 1, dpi: 400 });
    expect(requestRaster).toHaveBeenCalledWith({ docId: 'doc-1', page: 2, dpi: 400 });
  });

  it('streams page-level progress that only ever moves forward', async () => {
    const { service, progress } = await harness();
    await service.run('doc-1', await threePagePdf(), OPTIONS);

    const recognizing = progress.filter((event) => event.phase === 'Recognizing text');
    expect(recognizing[0]).toEqual({
      docId: 'doc-1',
      phase: 'Recognizing text',
      current: 0,
      total: 2,
    });
    expect(recognizing.map((event) => event.current)).toEqual([0, 1, 2]);
    expect(progress.at(-1)?.phase).toBe('Writing the text layer');
    expect(progress.every((event) => event.total === 2)).toBe(true);
  });

  it('runs pages through the pool, capped at the core count', async () => {
    const inFlight = { now: 0, peak: 0 };
    const runHocr = vi.fn(async () => {
      inFlight.now += 1;
      inFlight.peak = Math.max(inFlight.peak, inFlight.now);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight.now -= 1;
      return hocrWith(['WORD']);
    });
    const { service } = await harness({ cpuCount: () => 2, runHocr });
    await service.run('doc-1', await threePagePdf(), { ...OPTIONS, pages: [1, 2, 3] });
    expect(runHocr).toHaveBeenCalledTimes(3);
    expect(inFlight.peak).toBe(2);
  });

  it('accepts a page with no words when the raster is genuinely blank', async () => {
    const { service } = await harness({
      requestRaster: vi.fn(async () => ({
        requestId: 'r',
        png: blankPng(WIDTH, HEIGHT),
        widthPx: WIDTH,
        heightPx: HEIGHT,
      })),
      runHocr: vi.fn(async () => EMPTY_HOCR),
    });
    const result = await service.run('doc-1', await threePagePdf(), OPTIONS);
    expect(result.detail).toEqual({ pagesOcred: [1, 2], charsPerPage: [0, 0] });
  });

  it('FAILS when a page yields no words and the raster is not blank', async () => {
    const { service } = await harness({ runHocr: vi.fn(async () => EMPTY_HOCR) });
    await expect(service.run('doc-1', await threePagePdf(), OPTIONS)).rejects.toBeInstanceOf(
      EmptyOcrPageError
    );
  });

  it('fails the whole run when one page fails, never a partial success', async () => {
    const runHocr = vi.fn(async (request: { imagePath: string }) => {
      if (request.imagePath.endsWith('page-2.png')) throw new Error('Tesseract exited with code 1');
      return hocrWith(['OK']);
    });
    const { service } = await harness({ runHocr });
    await expect(service.run('doc-1', await threePagePdf(), OPTIONS)).rejects.toThrow(/code 1/);
  });

  it('fails when Tesseract read a different image than the renderer produced', async () => {
    const { service } = await harness({
      requestRaster: vi.fn(async () => ({
        requestId: 'r',
        png: inkedPng(WIDTH, HEIGHT),
        widthPx: 999,
        heightPx: HEIGHT,
      })),
    });
    await expect(service.run('doc-1', await threePagePdf(), OPTIONS)).rejects.toThrow(
      /refusing to place words/
    );
  });

  it('fails when the renderer hands back an empty raster', async () => {
    const { service } = await harness({
      requestRaster: vi.fn(async () => ({
        requestId: 'r',
        png: null,
        widthPx: 0,
        heightPx: 0,
      })),
    });
    await expect(service.run('doc-1', await threePagePdf(), OPTIONS)).rejects.toThrow(
      /no image data/
    );
  });

  it('cancels a run in flight', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runHocr = vi.fn(async () => {
      await gate;
      return hocrWith(['LATE']);
    });
    const { service } = await harness({ runHocr });
    const running = service.run('doc-1', await threePagePdf(), OPTIONS);
    await vi.waitFor(() => expect(runHocr).toHaveBeenCalled());
    service.cancel('doc-1');
    release();
    await expect(running).rejects.toBeInstanceOf(OcrCancelledError);
  });

  it('ignores a cancel for a document that is not running', async () => {
    const { service } = await harness();
    expect(() => service.cancel('nobody')).not.toThrow();
  });

  it('refuses a second run on the same document', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service } = await harness({
      runHocr: vi.fn(async () => {
        await gate;
        return hocrWith(['ONE']);
      }),
    });
    const bytes = await threePagePdf();
    const first = service.run('doc-1', bytes, OPTIONS);
    await expect(service.run('doc-1', bytes, OPTIONS)).rejects.toThrow(/already running/);
    release();
    await first;
  });

  it('removes its temp workspace when the run succeeds', async () => {
    const { service, tempRoot } = await harness();
    await service.run('doc-1', await threePagePdf(), OPTIONS);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('removes its temp workspace when the run fails', async () => {
    const { service, tempRoot } = await harness({
      runHocr: vi.fn(async () => {
        throw new Error('spawn ENOENT');
      }),
    });
    await expect(service.run('doc-1', await threePagePdf(), OPTIONS)).rejects.toThrow(/ENOENT/);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it.each([
    [{ pages: [] }, /No pages were selected/],
    [{ pages: [4] }, /outside this 3-page document/],
    [{ pages: [0] }, /outside this 3-page document/],
    [{ dpi: 0 }, /positive DPI/],
    [{ language: '  ' }, /needs a language/],
  ])('refuses nonsense options: %o', async (overrides, expected) => {
    const { service } = await harness();
    await expect(
      service.run('doc-1', await threePagePdf(), { ...OPTIONS, ...overrides })
    ).rejects.toThrow(expected);
  });
});

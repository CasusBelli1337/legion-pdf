/**
 * The OCR run: detect → rasterize → recognize → write the text layer.
 *
 * Everything the service touches is injected (raster round-trip, progress
 * emitter, temp root, binary resolution, the Tesseract runner), so the whole
 * orchestration is unit-testable in plain Node without Electron or a real
 * Tesseract install.
 */

import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type {
  OcrDetectResult,
  OcrOptions,
  OcrRunDetail,
  OpResult,
  RasterResponse,
} from '@shared/types';
import { detectTextLayer, writeTextLayer } from '@core/ocr';
import type { OcrPageWords } from '@core/ocr';
import type { TesseractLocation } from './tesseract-binary';
import type { TesseractRunRequest } from './tesseract-cli';
import { runTesseractHocr } from './tesseract-cli';
import { poolSize, runPool } from './pool';
import { recognizePage } from './page-worker';

export interface OcrProgress {
  docId: string;
  phase: string;
  current: number;
  total: number;
  message?: string;
}

export interface OcrServiceDeps {
  requestRaster(request: { docId: string; page: number; dpi: number }): Promise<RasterResponse>;
  emitProgress(progress: OcrProgress): void;
  locate(): TesseractLocation;
  cpuCount(): number;
  /** Root for the per-run temp workspace; defaults to the OS temp directory. */
  tempRoot?: string;
  /** Injectable for tests; defaults to spawning the real binary. */
  runHocr?: (request: TesseractRunRequest) => Promise<string>;
}

const RECOGNIZING = 'Recognizing text';
const WRITING = 'Writing the text layer';

/**
 * Tesseract's own opinion of each page, 0-100, averaged over the page's words.
 * The Word exporter shows it to the attorney ("94% average confidence") so a
 * badly recognised page is read with suspicion rather than trusted; a page with
 * no words (a proven-blank sheet) reports 0 rather than NaN.
 */
function meanConfidence(words: OcrPageWords['words']): number {
  if (words.length === 0) return 0;
  return words.reduce((total, word) => total + word.confidence, 0) / words.length;
}

/** The writer's detail, plus the confidence only the recognizer knows. */
function withConfidence(
  result: OpResult<OcrRunDetail>,
  recognized: readonly OcrPageWords[]
): OpResult<OcrRunDetail> {
  const byPage = new Map(recognized.map((page) => [page.page, page.words]));
  return {
    ...result,
    detail: {
      ...result.detail,
      confidencePerPage: result.detail.pagesOcred.map((page) =>
        meanConfidence(byPage.get(page) ?? [])
      ),
    },
  };
}

function assertOptions(options: OcrOptions, pageCount: number): void {
  if (options.pages.length === 0) {
    throw new RangeError('No pages were selected for text recognition.');
  }
  const outOfRange = options.pages.filter((page) => page < 1 || page > pageCount);
  if (outOfRange.length > 0) {
    throw new RangeError(
      `Pages ${outOfRange.join(', ')} are outside this ${pageCount}-page document.`
    );
  }
  if (!Number.isFinite(options.dpi) || options.dpi <= 0) {
    throw new RangeError(`Text recognition needs a positive DPI, got ${options.dpi}.`);
  }
  if (options.language.trim().length === 0) {
    throw new RangeError('Text recognition needs a language, e.g. "eng".');
  }
}

export class OcrService {
  private readonly runs = new Map<string, AbortController>();

  constructor(private readonly deps: OcrServiceDeps) {}

  /** Which pages already carry a text layer, and which are pictures of words. */
  detect(bytes: Uint8Array): Promise<OcrDetectResult> {
    return detectTextLayer(bytes);
  }

  /** Abort a run: outstanding Tesseract processes are killed, the queue drains. */
  cancel(docId: string): void {
    this.runs.get(docId)?.abort();
  }

  async run(
    docId: string,
    bytes: Uint8Array,
    options: OcrOptions
  ): Promise<OpResult<OcrRunDetail>> {
    const detected = await this.detect(bytes);
    assertOptions(options, detected.pageCount);
    if (this.runs.has(docId)) {
      throw new Error('Text recognition is already running on this document.');
    }
    const controller = new AbortController();
    this.runs.set(docId, controller);
    const workspace = await mkdtemp(join(this.deps.tempRoot ?? tmpdir(), 'librarius-ocr-'));
    try {
      const recognized = await this.recognizeAll(docId, options, workspace, controller.signal);
      this.report(docId, WRITING, options.pages.length, options.pages.length);
      return withConfidence(await writeTextLayer(bytes, recognized), recognized);
    } finally {
      this.runs.delete(docId);
      await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async recognizeAll(
    docId: string,
    options: OcrOptions,
    workspace: string,
    signal: AbortSignal
  ): Promise<OcrPageWords[]> {
    const total = options.pages.length;
    const context = {
      docId,
      dpi: options.dpi,
      language: options.language,
      workspace,
      location: this.deps.locate(),
      signal,
      requestRaster: this.deps.requestRaster,
      runHocr: this.deps.runHocr ?? runTesseractHocr,
    };
    let done = 0;
    this.report(docId, RECOGNIZING, 0, total);
    return runPool(
      options.pages,
      poolSize(this.deps.cpuCount(), options.workers),
      async (page) => {
        const result = await recognizePage(page, context);
        done += 1;
        this.report(docId, RECOGNIZING, done, total, `Page ${page}`);
        return result;
      },
      signal
    );
  }

  private report(
    docId: string,
    phase: string,
    current: number,
    total: number,
    message?: string
  ): void {
    this.deps.emitProgress(
      message === undefined
        ? { docId, phase, current, total }
        : { docId, phase, current, total, message }
    );
  }
}

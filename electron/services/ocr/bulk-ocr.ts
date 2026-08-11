/**
 * Bulk OCR: whole files off disk, none of them open in a tab.
 *
 * Sequential over FILES, parallel over PAGES — one file at a time saturates the
 * machine already (the page pool runs one Tesseract per core), and running two
 * files at once would only make the progress readout lie about what is
 * happening.
 *
 * Three promises this class keeps, all of them the "silent data loss" rules:
 *
 *   1. ONE RESULT PER INPUT, in request order. A file that was skipped, failed,
 *      or never reached is present in the receipt with a status, never absent.
 *   2. The input file is never touched. Output is a NEW file — "<name>
 *      (searchable).pdf" — so a run that goes wrong costs nothing.
 *   3. One file's failure is that file's failure. The run continues and the
 *      receipt says which one broke and why.
 *
 * Everything it touches is injected, so the whole orchestration is unit-tested
 * without Electron, a doc store, or a real Tesseract.
 */

import { basename, dirname, extname, join } from 'node:path';
import type {
  BulkOcrFileResult,
  BulkOcrOptions,
  BulkOcrResult,
  OcrDetectResult,
  OcrOptions,
  OcrRunDetail,
  OpResult,
  ProgressEvent,
} from '@shared/types';
import type { OcrProgress } from './ocr-service';

/** Production defaults, the same ones the single-document panel runs with. */
const LANGUAGE = 'eng';
const DPI = 300;

export interface BulkOcrDeps {
  readFile(path: string): Promise<Uint8Array>;
  /** Puts bytes in the doc store WITHOUT a tab; answers the id the rasters use. */
  adopt(bytes: Uint8Array, fileName: string): Promise<string>;
  closeDoc(docId: string): void;
  detect(bytes: Uint8Array): Promise<OcrDetectResult>;
  runOcr(
    docId: string,
    bytes: Uint8Array,
    options: OcrOptions,
    onProgress: (progress: OcrProgress) => void
  ): Promise<OpResult<OcrRunDetail>>;
  /** Atomic write. Bulk does NOT go through the store: these are not recent files. */
  writeOutput(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  emitProgress(event: ProgressEvent): void;
}

/**
 * Where one file's searchable copy lands. Always a new name, so the output can
 * never be the input — the original scan is safe even if everything else fails.
 */
export function bulkOutputPath(inputPath: string, outputDir?: string): string {
  const stem = basename(inputPath, extname(inputPath));
  return join(outputDir ?? dirname(inputPath), `${stem} (searchable).pdf`);
}

/** One file, already opened and measured, on its way through recognition. */
interface BulkFileJob {
  path: string;
  name: string;
  docId: string;
  bytes: Uint8Array;
  /** The pages that carry no text layer — the only ones worth OCR'ing. */
  pages: number[];
  outputPath: string;
}

function totalOf(counts: readonly number[]): number {
  return counts.reduce((sum, count) => sum + count, 0);
}

function plainMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^[A-Za-z]*Error:\s*/, '').trim();
}

function outcome(path: string, status: 'cancelled' | 'failed', error?: string): BulkOcrFileResult {
  const base: BulkOcrFileResult = { path, outputPath: null, pages: 0, words: 0, status };
  return error === undefined ? base : { ...base, error };
}

export class BulkOcrRunner {
  private cancelled = false;
  private running = false;

  constructor(private readonly deps: BulkOcrDeps) {}

  /** Stops the run after the file in flight; finished files keep their output. */
  cancel(): void {
    if (this.running) this.cancelled = true;
  }

  async run(paths: readonly string[], options: BulkOcrOptions): Promise<BulkOcrResult> {
    if (paths.length === 0) throw new RangeError('No files were chosen for text recognition.');
    if (this.running) throw new Error('Text recognition is already running on a set of files.');
    this.running = true;
    this.cancelled = false;
    const files: BulkOcrFileResult[] = [];
    try {
      for (const [index, path] of paths.entries()) {
        files.push(await this.oneFile(path, index, paths.length, options));
      }
    } finally {
      this.running = false;
    }
    return assembleResult(paths, files);
  }

  /** A file's own failure never takes the run down; it becomes that file's row. */
  private async oneFile(
    path: string,
    index: number,
    total: number,
    options: BulkOcrOptions
  ): Promise<BulkOcrFileResult> {
    if (this.cancelled) return outcome(path, 'cancelled');
    try {
      return await this.ocrFile(path, index, total, options);
    } catch (error) {
      return outcome(path, 'failed', plainMessage(error));
    }
  }

  private async ocrFile(
    path: string,
    index: number,
    total: number,
    options: BulkOcrOptions
  ): Promise<BulkOcrFileResult> {
    const name = basename(path);
    const outputPath = bulkOutputPath(path, options.outputDir);
    this.report(index, total, `${name} — checking the pages`);
    await this.assertWritable(outputPath, options.overwrite);

    const bytes = await this.deps.readFile(path);
    const docId = await this.deps.adopt(bytes, name);
    try {
      const detected = await this.deps.detect(bytes);
      const pages = detected.pagesNeedingOcr;
      // Already searchable: nothing is written and nothing is claimed. The row
      // still lands in the receipt (pages 0, words 0, no output file) so the
      // attorney sees the file was looked at and left alone.
      if (pages.length === 0) return { path, outputPath: null, pages: 0, words: 0, status: 'done' };
      const job: BulkFileJob = { path, name, docId, bytes, pages, outputPath };
      return await this.recognize(job, index, total, options);
    } finally {
      this.deps.closeDoc(docId);
    }
  }

  private async recognize(
    file: BulkFileJob,
    index: number,
    total: number,
    options: BulkOcrOptions
  ): Promise<BulkOcrFileResult> {
    const result = await this.deps.runOcr(
      file.docId,
      file.bytes,
      { pages: file.pages, language: LANGUAGE, dpi: DPI },
      (progress) =>
        this.report(index, total, `${file.name} — page ${progress.current} of ${progress.total}`)
    );
    assertEveryPageRecognized(file.name, file.pages, result);

    // Re-checked at the last moment: the folder can change while a long run works.
    await this.assertWritable(file.outputPath, options.overwrite);
    this.report(index, total, `${file.name} — saving the searchable copy`);
    await this.deps.writeOutput(file.outputPath, result.bytes);
    return {
      path: file.path,
      outputPath: file.outputPath,
      pages: result.detail.pagesOcred.length,
      words: totalOf(result.detail.wordsPerPage),
      status: 'done',
    };
  }

  private async assertWritable(outputPath: string, overwrite: boolean): Promise<void> {
    if (overwrite || !(await this.deps.exists(outputPath))) return;
    throw new Error(
      `${basename(outputPath)} already exists. Turn on "Replace files that are already there" to replace it.`
    );
  }

  /** docId is null: this work belongs to no tab. current/total count FILES. */
  private report(index: number, total: number, phase: string): void {
    this.deps.emitProgress({ docId: null, phase, current: index + 1, total });
  }
}

/** Every page asked for came back with words placed, or the file failed. */
function assertEveryPageRecognized(
  name: string,
  pages: readonly number[],
  result: OpResult<OcrRunDetail>
): void {
  if (result.detail.pagesOcred.length !== pages.length) {
    throw new Error(
      `${name}: text recognition covered ${result.detail.pagesOcred.length} of the ${pages.length} pages that needed it.`
    );
  }
  if (result.bytes.byteLength === 0) {
    throw new Error(`${name}: text recognition produced an empty document.`);
  }
}

/** The silent-skip guard: the receipt must account for every file that was asked for. */
function assembleResult(paths: readonly string[], files: BulkOcrFileResult[]): BulkOcrResult {
  if (files.length !== paths.length) {
    throw new Error(
      `Bulk text recognition accounted for ${files.length} of ${paths.length} files — refusing to report a partial run as finished.`
    );
  }
  return {
    files,
    succeeded: files.filter((file) => file.status === 'done').length,
    failed: files.filter((file) => file.status === 'failed').length,
  };
}

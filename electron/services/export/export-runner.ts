/**
 * The export pipeline: resolve the pages, hand them to the format's exporter,
 * stream progress, allow exactly one cancel, and then PROVE the files are there
 * before calling it a success.
 *
 * The verification at the end is the point of this class. Every failure mode
 * this lane can have looks like a success from the inside — a page range that
 * selected nothing, a folder that took 3 of 65 files, a TIFF that lost its last
 * page, a write that produced a zero-byte file. So the result is re-checked
 * against the request, and the files are re-checked on disk, before the promise
 * resolves.
 *
 * Nothing here touches Electron: the whole pipeline runs in Vitest against a
 * fake raster source and a fake filesystem.
 */

import { basename } from 'node:path';
import { exportFormatInfo } from '@shared/export-formats';
import type { ExportFormatInfo } from '@shared/export-formats';
import { parsePageRanges } from '@core/ops';
import type {
  ExportFormat,
  ExportOptions,
  ExportResult,
  PageRangeSpec,
  ProgressEvent,
} from '@shared/types';
import { EXPORTERS } from './exporter';
import type { Exporter, ExporterContext, ExportJob } from './exporter';

export interface ExportRunnerDeps {
  context: ExporterContext;
  bytesOf(docId: string): Uint8Array;
  fileNameOf(docId: string): string;
  pageCountOf(docId: string): number;
  emitProgress(event: ProgressEvent): void;
  /** Bytes on disk for a finished file. The zero-byte guard reads this. */
  sizeOf(path: string): Promise<number>;
  /** The format table. Injectable so the pipeline itself can be tested. */
  exporters?: Record<ExportFormat, Exporter>;
}

/** "all", "", or undefined mean the whole document; anything else is parsed. */
export function resolvePages(spec: PageRangeSpec | undefined, pageCount: number): number[] {
  const trimmed = (spec ?? '').trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === 'all') {
    return Array.from({ length: pageCount }, (_unused, index) => index + 1);
  }
  return parsePageRanges(trimmed, pageCount);
}

function assertOutputPath(options: ExportOptions, info: ExportFormatInfo): void {
  if (options.outputPath.trim().length === 0) {
    const what = info.output === 'folder' ? 'folder' : 'file name';
    throw new Error(`Choose where to save the export first — no ${what} was given.`);
  }
}

export class ExportRunner {
  private readonly running = new Map<string, AbortController>();

  constructor(private readonly deps: ExportRunnerDeps) {}

  /** Stops after the page in flight. Files already written stay where they are. */
  cancel(docId: string): void {
    this.running.get(docId)?.abort();
  }

  async run(docId: string, options: ExportOptions): Promise<ExportResult> {
    const info = exportFormatInfo(options.format);
    assertOutputPath(options, info);
    const pages = resolvePages(options.pages, this.deps.pageCountOf(docId));
    if (this.running.has(docId)) {
      throw new Error('This document is already being exported. Let it finish, or stop it first.');
    }

    const controller = new AbortController();
    this.running.set(docId, controller);
    try {
      const result = await this.exporterFor(options.format)(
        this.jobFor(docId, options, pages, controller.signal),
        this.deps.context
      );
      await this.assertComplete(result, info, pages.length);
      return result;
    } finally {
      this.running.delete(docId);
    }
  }

  private exporterFor(format: ExportFormat): Exporter {
    const exporter = (this.deps.exporters ?? EXPORTERS)[format];
    if (exporter === undefined) throw new Error(`There is no exporter for "${format}".`);
    return exporter;
  }

  private jobFor(
    docId: string,
    options: ExportOptions,
    pages: number[],
    signal: AbortSignal
  ): ExportJob {
    return {
      docId,
      bytes: this.deps.bytesOf(docId),
      fileName: this.deps.fileNameOf(docId),
      options,
      pages,
      signal,
      report: (current, total, phase) => this.deps.emitProgress({ docId, phase, current, total }),
    };
  }

  /** The count-verification gate. Every branch here has bitten some pipeline. */
  private async assertComplete(
    result: ExportResult,
    info: ExportFormatInfo,
    requested: number
  ): Promise<void> {
    const expected = info.output === 'folder' ? requested : 1;
    if (result.files.length !== expected) {
      throw new Error(
        `The export reported success with ${result.files.length} ` +
          `${result.files.length === 1 ? 'file' : 'files'} where ${expected} were due.`
      );
    }
    if (result.pagesExported !== requested) {
      throw new Error(
        `The export covered ${result.pagesExported} of the ${requested} pages that were asked for.`
      );
    }
    for (const file of result.files) {
      if ((await this.deps.sizeOf(file)) > 0) continue;
      throw new Error(`${basename(file)} was written but is empty — the export did not finish.`);
    }
  }
}

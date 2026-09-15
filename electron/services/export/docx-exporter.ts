/**
 * The Word exporter: recognizes any page that is a picture of words, asks the
 * renderer for each page's layout, has core/export rebuild them as a .docx, and
 * writes the file — atomically, then re-read to prove the bytes landed.
 *
 * Scanned pages come first because everything after them depends on their
 * words: the recognized document is adopted into the store WITHOUT a tab (the
 * attorney's own file is never touched), every layout is then read from that
 * adopted copy, and it is dropped again whatever happens. Progress is reported
 * per page throughout, so the panel shows "Recognizing text on scanned pages —
 * 3/6" and never a frozen spinner.
 */

import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { buildDocx } from '@core/export';
import type { DocxBuild } from '@core/export';
import { detectTextLayer } from '@core/ocr';
import type { ExportResult, PageLayout } from '@shared/types';
import { writeFileAtomic } from '../atomic-write';
import type { ExportContext, ExportJob, Exporter } from './export-job';
import {
  DETECTION_FAILED_NOTE,
  PHASE_RECOGNIZE,
  assertEveryScanRecognized,
  receiptWith,
  scanNotes,
  scansWithin,
} from './scan-pages';

export const PHASE_READ = 'Reading page layout';
export const PHASE_BUILD = 'Building the Word document';
export { PHASE_RECOGNIZE };

function stem(fileName: string): string {
  return basename(fileName).replace(/\.pdf$/i, '');
}

async function layoutsOf(job: ExportJob, context: ExportContext, docId: string) {
  const layouts: PageLayout[] = [];
  for (const [index, page] of job.pages.entries()) {
    if (job.signal.aborted) throw new Error('The export was stopped.');
    job.report(index + 1, job.pages.length, PHASE_READ);
    const response = await context.requestLayout({ docId, page });
    if (response.layout === null) {
      throw new Error(response.error ?? `Page ${page} could not be read for export.`);
    }
    layouts.push(response.layout);
  }
  if (layouts.length !== job.pages.length) {
    throw new Error(`Only ${layouts.length} of ${job.pages.length} pages could be read.`);
  }
  return layouts;
}

/** The file on disk must be exactly the bytes that were built. */
async function proveWritten(filePath: string, byteLength: number): Promise<void> {
  const info = await stat(filePath);
  if (info.size !== byteLength) {
    throw new Error(
      `${basename(filePath)} is ${info.size} bytes on disk where ${byteLength} were written.`
    );
  }
}

/**
 * Which pages are pictures of words. A document whose content streams cannot
 * be read is not a reason to refuse the export — it exported fine before this
 * step existed — so detection failing becomes a note the attorney can act on.
 */
async function scannedPagesOf(job: ExportJob): Promise<{ pages: number[]; note: string | null }> {
  try {
    const detected = await detectTextLayer(job.bytes);
    return { pages: scansWithin(job.pages, detected.pagesNeedingOcr), note: null };
  } catch {
    return { pages: [], note: DETECTION_FAILED_NOTE };
  }
}

interface Recognition {
  /** The adopted document the layouts are read from. */
  docId: string;
  notes: string[];
  close(): void;
}

async function recognizeScans(
  job: ExportJob,
  context: ExportContext,
  scans: readonly number[]
): Promise<Recognition> {
  job.report(0, scans.length, PHASE_RECOGNIZE);
  const run = await context.recognizeText(job.docId, job.bytes, scans, (current, total) =>
    job.report(current, total, PHASE_RECOGNIZE)
  );
  assertEveryScanRecognized(scans, run);
  const docId = await context.adopt(run.bytes, job.fileName);
  return { docId, notes: scanNotes(run.detail), close: () => context.closeDoc(docId) };
}

/** The file, plus what the attorney should know about it — kept and lost. */
function resultOf(
  build: DocxBuild,
  outputPath: string,
  kept: readonly string[],
  dropped: readonly string[]
): ExportResult {
  return {
    format: 'docx',
    files: [outputPath],
    pagesExported: build.pageCount,
    notes: [...build.notes, ...kept, ...dropped],
    receipt: receiptWith(build.receipt, kept, dropped),
  };
}

function assertExportable(job: ExportJob): string {
  if (job.pages.length === 0) throw new Error('There are no pages to export.');
  const outputPath = job.options.outputPath;
  if (outputPath.trim().length === 0) throw new Error('Choose where to save the Word file first.');
  return outputPath;
}

export const docxExporter: Exporter = async (job, context) => {
  const outputPath = assertExportable(job);
  const scanned = await scannedPagesOf(job);
  const recognition =
    scanned.pages.length === 0 ? null : await recognizeScans(job, context, scanned.pages);
  try {
    const layouts = await layoutsOf(job, context, recognition?.docId ?? job.docId);
    job.report(job.pages.length, job.pages.length, PHASE_BUILD);
    const build = await buildDocx(layouts, {
      title: stem(job.fileName),
      scanPictures: job.options.scanPictures ?? 'omit',
    });
    await writeFileAtomic(outputPath, build.bytes);
    await proveWritten(outputPath, build.bytes.byteLength);
    return resultOf(
      build,
      outputPath,
      recognition?.notes ?? [],
      scanned.note === null ? [] : [scanned.note]
    );
  } finally {
    recognition?.close();
  }
};

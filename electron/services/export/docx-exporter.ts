/**
 * The Word exporter: asks the renderer for each page's layout, has core/export
 * rebuild them as a .docx, and writes the file — atomically, then re-read to
 * prove the bytes landed. Progress is reported per page so the panel shows
 * "Reading page 12/65" and never a frozen spinner.
 */

import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { buildDocx } from '@core/export';
import type { PageLayout } from '@shared/types';
import { writeFileAtomic } from '../atomic-write';
import type { ExportContext, ExportJob, Exporter } from './export-job';

export const PHASE_READ = 'Reading page layout';
export const PHASE_BUILD = 'Building the Word document';

function stem(fileName: string): string {
  return basename(fileName).replace(/\.pdf$/i, '');
}

async function layoutsOf(job: ExportJob, context: ExportContext): Promise<PageLayout[]> {
  const layouts: PageLayout[] = [];
  for (const [index, page] of job.pages.entries()) {
    if (job.signal.aborted) throw new Error('The export was stopped.');
    job.report(index + 1, job.pages.length, PHASE_READ);
    const response = await context.requestLayout({ docId: job.docId, page });
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

export const docxExporter: Exporter = async (job, context) => {
  if (job.pages.length === 0) throw new Error('There are no pages to export.');
  const outputPath = job.options.outputPath;
  if (outputPath.trim().length === 0) throw new Error('Choose where to save the Word file first.');
  const layouts = await layoutsOf(job, context);
  job.report(job.pages.length, job.pages.length, PHASE_BUILD);
  const build = await buildDocx(layouts, { title: stem(job.fileName) });
  await writeFileAtomic(outputPath, build.bytes);
  await proveWritten(outputPath, build.bytes.byteLength);
  return {
    format: 'docx',
    files: [outputPath],
    pagesExported: build.pageCount,
    notes: build.notes,
  };
};

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { LayoutResponse, PageLayout } from '@shared/types';
import { PHASE_BUILD, PHASE_READ, docxExporter } from './docx-exporter';
import type { ExportContext, ExportJob } from './export-job';

function layoutFor(page: number): PageLayout {
  return {
    page,
    size: { width: 612, height: 792 },
    rotation: 0,
    fonts: { f1: { name: 'Times-Roman', family: 'serif', bold: false, italic: false } },
    runs: [
      {
        text: `Body text of page ${page} for the export.`,
        x: 72,
        y: 700,
        width: 250,
        sizePt: 12,
        fontKey: 'f1',
        role: 'body',
        eol: false,
      },
    ],
    images: [],
    rules: [],
    printedPageNumber: null,
  };
}

let workDir = '';
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'librarius-docx-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function jobFor(
  pages: number[],
  outputPath: string,
  signal = new AbortController().signal
): ExportJob {
  return {
    docId: 'doc',
    bytes: new Uint8Array([1]),
    fileName: 'Motion.pdf',
    options: { format: 'docx', outputPath },
    pages,
    signal,
    report: vi.fn(),
  };
}

function contextThat(answer: (page: number) => LayoutResponse): ExportContext {
  return {
    requestRaster: () => Promise.reject(new Error('not needed')),
    requestLayout: ({ page }) => Promise.resolve(answer(page)),
  };
}

describe('docxExporter', () => {
  it('reads every page, writes the file, and reports progress per page', async () => {
    const outputPath = join(workDir, 'Motion.docx');
    const job = jobFor([1, 2, 3], outputPath);
    const result = await docxExporter(
      job,
      contextThat((page) => ({ requestId: 'r', layout: layoutFor(page) }))
    );

    expect(result).toMatchObject({ format: 'docx', files: [outputPath], pagesExported: 3 });
    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Body text of page 3');
    expect(job.report).toHaveBeenCalledWith(1, 3, PHASE_READ);
    expect(job.report).toHaveBeenCalledWith(3, 3, PHASE_BUILD);
  });

  it('fails loudly when a page cannot be read, and writes nothing', async () => {
    const outputPath = join(workDir, 'Motion.docx');
    await expect(
      docxExporter(
        jobFor([1, 2], outputPath),
        contextThat((page) =>
          page === 2
            ? { requestId: 'r', layout: null, error: 'Page 2 fell over.' }
            : { requestId: 'r', layout: layoutFor(page) }
        )
      )
    ).rejects.toThrow(/Page 2 fell over/);
    await expect(readFile(outputPath)).rejects.toThrow();
  });

  it('stops when the job is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      docxExporter(
        jobFor([1], join(workDir, 'x.docx'), controller.signal),
        contextThat((page) => ({ requestId: 'r', layout: layoutFor(page) }))
      )
    ).rejects.toThrow(/stopped/);
  });

  it('refuses without an output path or pages', async () => {
    const context = contextThat((page) => ({ requestId: 'r', layout: layoutFor(page) }));
    await expect(docxExporter(jobFor([1], ''), context)).rejects.toThrow(/where to save/);
    await expect(docxExporter(jobFor([], join(workDir, 'x.docx')), context)).rejects.toThrow(
      /no pages/
    );
  });
});

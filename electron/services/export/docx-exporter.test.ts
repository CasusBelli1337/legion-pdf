import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { LayoutResponse, OcrRunDetail, OpResult, PageLayout } from '@shared/types';
import { PHASE_BUILD, PHASE_READ, PHASE_RECOGNIZE, docxExporter } from './docx-exporter';
import type { ExportContext, ExportJob } from './export-job';

/**
 * Real PDF bytes, because the exporter now reads them itself to find the pages
 * that are pictures of words. `scans` name the pages left blank.
 */
async function pdfWith(pageCount: number, scans: readonly number[] = []): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.TimesRoman);
  for (let page = 1; page <= pageCount; page += 1) {
    const sheet = document.addPage([612, 792]);
    if (scans.includes(page)) continue;
    sheet.drawText(`Body text of page ${page} for the export.`, { x: 72, y: 700, size: 12, font });
  }
  return document.save();
}

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
  bytes: Uint8Array,
  signal = new AbortController().signal
): ExportJob {
  return {
    docId: 'doc',
    bytes,
    fileName: 'Motion.pdf',
    options: { format: 'docx', outputPath },
    pages,
    signal,
    report: vi.fn(),
  };
}

/** A recognition run that places `words` on every page it was asked for. */
function ocrResult(
  bytes: Uint8Array,
  pages: readonly number[],
  words = 120,
  confidence = 93.6
): OpResult<OcrRunDetail> {
  return {
    bytes,
    pagesIn: pages.length,
    pagesOut: pages.length,
    detail: {
      pagesOcred: [...pages],
      charsPerPage: pages.map(() => words * 5),
      wordsPerPage: pages.map(() => words),
      confidencePerPage: pages.map(() => confidence),
    },
  };
}

interface Fakes {
  context: ExportContext;
  recognizeText: ReturnType<typeof vi.fn>;
  adopt: ReturnType<typeof vi.fn>;
  closeDoc: ReturnType<typeof vi.fn>;
  layoutIds: string[];
}

function fakes(
  answer: (page: number) => LayoutResponse = (page) => ({
    requestId: 'r',
    layout: layoutFor(page),
  }),
  run: (pages: readonly number[]) => Promise<OpResult<OcrRunDetail>> = async (pages) =>
    ocrResult(await pdfWith(pages.length), pages)
): Fakes {
  const layoutIds: string[] = [];
  const recognizeText = vi.fn(
    (
      _docId: string,
      _bytes: Uint8Array,
      pages: readonly number[],
      onProgress: (current: number, total: number) => void
    ) => {
      pages.forEach((_page, index) => onProgress(index + 1, pages.length));
      return run(pages);
    }
  );
  const adopt = vi.fn(() => Promise.resolve('adopted-doc'));
  const closeDoc = vi.fn();
  return {
    layoutIds,
    recognizeText,
    adopt,
    closeDoc,
    context: {
      requestRaster: () => Promise.reject(new Error('not needed')),
      requestLayout: ({ docId, page }) => {
        layoutIds.push(docId);
        return Promise.resolve(answer(page));
      },
      recognizeText: recognizeText as unknown as ExportContext['recognizeText'],
      adopt: adopt as unknown as ExportContext['adopt'],
      closeDoc,
    },
  };
}

describe('docxExporter', () => {
  it('reads every page, writes the file, and reports progress per page', async () => {
    const outputPath = join(workDir, 'Motion.docx');
    const job = jobFor([1, 2, 3], outputPath, await pdfWith(3));
    const result = await docxExporter(job, fakes().context);

    expect(result).toMatchObject({ format: 'docx', files: [outputPath], pagesExported: 3 });
    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Body text of page 3');
    expect(job.report).toHaveBeenCalledWith(1, 3, PHASE_READ);
    expect(job.report).toHaveBeenCalledWith(3, 3, PHASE_BUILD);
  });

  it('fails loudly when a page cannot be read, and writes nothing', async () => {
    const outputPath = join(workDir, 'Motion.docx');
    const { context } = fakes((page) =>
      page === 2
        ? { requestId: 'r', layout: null, error: 'Page 2 fell over.' }
        : { requestId: 'r', layout: layoutFor(page) }
    );
    await expect(
      docxExporter(jobFor([1, 2], outputPath, await pdfWith(2)), context)
    ).rejects.toThrow(/Page 2 fell over/);
    await expect(readFile(outputPath)).rejects.toThrow();
  });

  it('stops when the job is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      docxExporter(
        jobFor([1], join(workDir, 'x.docx'), await pdfWith(1), controller.signal),
        fakes().context
      )
    ).rejects.toThrow(/stopped/);
  });

  it('refuses without an output path or pages', async () => {
    const { context } = fakes();
    const bytes = await pdfWith(1);
    await expect(docxExporter(jobFor([1], '', bytes), context)).rejects.toThrow(/where to save/);
    await expect(docxExporter(jobFor([], join(workDir, 'x.docx'), bytes), context)).rejects.toThrow(
      /no pages/
    );
  });
});

describe('scanned pages', () => {
  it('recognizes nothing when every page already has text', async () => {
    const parts = fakes();
    await docxExporter(jobFor([1, 2], join(workDir, 'a.docx'), await pdfWith(2)), parts.context);
    expect(parts.recognizeText).not.toHaveBeenCalled();
    expect(parts.adopt).not.toHaveBeenCalled();
    expect(parts.closeDoc).not.toHaveBeenCalled();
    expect(parts.layoutIds).toEqual(['doc', 'doc']);
  });

  it('recognizes EXACTLY the scanned pages, reads the adopted copy, and closes it', async () => {
    const parts = fakes();
    const job = jobFor([1, 2, 3], join(workDir, 'b.docx'), await pdfWith(3, [2, 3]));
    await docxExporter(job, parts.context);

    expect(parts.recognizeText).toHaveBeenCalledTimes(1);
    expect(parts.recognizeText.mock.calls[0]![2]).toEqual([2, 3]);
    expect(parts.adopt).toHaveBeenCalledWith(expect.any(Uint8Array), 'Motion.pdf');
    expect(parts.layoutIds).toEqual(['adopted-doc', 'adopted-doc', 'adopted-doc']);
    expect(parts.closeDoc).toHaveBeenCalledWith('adopted-doc');
    expect(job.report).toHaveBeenCalledWith(0, 2, PHASE_RECOGNIZE);
    expect(job.report).toHaveBeenCalledWith(2, 2, PHASE_RECOGNIZE);
  });

  it('only recognizes the scans INSIDE the requested range', async () => {
    const parts = fakes();
    await docxExporter(
      jobFor([1, 2], join(workDir, 'c.docx'), await pdfWith(4, [2, 4])),
      parts.context
    );
    expect(parts.recognizeText.mock.calls[0]![2]).toEqual([2]);
  });

  it('closes the adopted copy even when the build falls over', async () => {
    const parts = fakes(() => ({ requestId: 'r', layout: null, error: 'The page died.' }));
    await expect(
      docxExporter(jobFor([1], join(workDir, 'd.docx'), await pdfWith(1, [1])), parts.context)
    ).rejects.toThrow(/The page died/);
    expect(parts.closeDoc).toHaveBeenCalledWith('adopted-doc');
  });

  it('REFUSES a scanned page that recognized to no words, rather than write an empty page', async () => {
    const parts = fakes(undefined, async (pages) => ocrResult(await pdfWith(2), pages, 0));
    await expect(
      docxExporter(jobFor([1, 2], join(workDir, 'e.docx'), await pdfWith(2, [1, 2])), parts.context)
    ).rejects.toThrow(/No text could be recognized on pages 1, 2/);
    await expect(readFile(join(workDir, 'e.docx'))).rejects.toThrow();
    expect(parts.closeDoc).not.toHaveBeenCalled();
  });

  it('refuses when a scanned page never came back from recognition', async () => {
    const parts = fakes(undefined, async () => ocrResult(await pdfWith(2), [1]));
    await expect(
      docxExporter(jobFor([1, 2], join(workDir, 'f.docx'), await pdfWith(2, [1, 2])), parts.context)
    ).rejects.toThrow(/Text recognition covered 1 of the 2 scanned pages/);
  });

  it('tells the attorney which pages were scans, how well they read, and what to check', async () => {
    const parts = fakes();
    const result = await docxExporter(
      jobFor([1, 2], join(workDir, 'g.docx'), await pdfWith(2, [2])),
      parts.context
    );
    const line =
      'Page 2 was a scan; its text was recognized (94% average confidence) — check names and numbers.';
    expect(result.notes).toContain(line);
    expect(result.receipt?.kept).toContain(line);
  });

  it('carries the build receipt through, so what was left out reaches the panel', async () => {
    const parts = fakes();
    const result = await docxExporter(
      jobFor([1], join(workDir, 'h.docx'), await pdfWith(1)),
      parts.context
    );
    expect(result.receipt).toEqual({ kept: [], dropped: [] });
  });
});

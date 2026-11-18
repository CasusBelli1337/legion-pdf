import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import type { LayoutRequest, PageLayout } from '@shared/types';
import { docxExporter } from './docx-exporter';
import type { ExportContext, ExportJob } from './export-job';

/**
 * A court's notice scanned with the envelope it came in: two pictures of
 * paper, the second turned sideways. The notice is recognized; the envelope
 * is not — it goes in as a picture, the way the preview said it would.
 */
async function scannedPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.addPage([792, 612]);
  return document.save();
}

const WORDS = 'The clerk gives notice that the hearing is continued to the date below.';

function layoutOf(page: number, recognized: boolean): PageLayout {
  const upright = page === 1;
  return {
    page,
    size: upright ? { width: 612, height: 792 } : { width: 792, height: 612 },
    rotation: 0,
    fonts: { f1: { name: 'Times-Roman', family: 'serif', bold: false, italic: false } },
    runs:
      recognized && upright
        ? [
            {
              text: WORDS,
              x: 72,
              y: 700,
              width: 400,
              sizePt: 12,
              fontKey: 'f1',
              role: 'body',
              eol: false,
              hidden: true,
            },
          ]
        : [],
    images: [],
    rules: [],
    printedPageNumber: null,
  };
}

let workDir = '';
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'librarius-loose-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('a loose sheet in a document that is scans throughout', () => {
  it('glances first, recognizes only the notice, and keeps the envelope as a picture', async () => {
    const bytes = await scannedPdf();
    const asked: Omit<LayoutRequest, 'requestId'>[] = [];
    const drawn: number[] = [];
    const recognizeText = vi.fn((_docId: string, _bytes: Uint8Array, pages: readonly number[]) =>
      Promise.resolve({
        bytes,
        pagesIn: pages.length,
        pagesOut: pages.length,
        detail: {
          pagesOcred: [...pages],
          charsPerPage: pages.map(() => 600),
          wordsPerPage: pages.map(() => 120),
          confidencePerPage: pages.map(() => 93),
        },
      })
    );
    const context: ExportContext = {
      requestLayout: (request) => {
        asked.push(request);
        return Promise.resolve({
          requestId: 'r',
          layout: layoutOf(request.page, request.docId === 'adopted'),
        });
      },
      recognizeText: recognizeText as unknown as ExportContext['recognizeText'],
      adopt: () => Promise.resolve('adopted'),
      closeDoc: vi.fn(),
      requestRaster: ({ page }) => {
        drawn.push(page);
        return Promise.resolve({ png: new Uint8Array([1, 2, 3]), widthPx: 10, heightPx: 10 });
      },
      toJpeg: (png) => png,
    };
    const outputPath = join(workDir, 'notice.docx');
    const job: ExportJob = {
      docId: 'doc',
      bytes,
      fileName: 'Notice.pdf',
      options: { format: 'docx', outputPath },
      pages: [1, 2],
      signal: new AbortController().signal,
      report: vi.fn(),
    };

    const result = await docxExporter(job, context);

    // The glance reads the attorney's own file without picture pixels.
    expect(asked.slice(0, 2)).toEqual([
      { docId: 'doc', page: 1, pictures: false },
      { docId: 'doc', page: 2, pictures: false },
    ]);
    expect(recognizeText.mock.calls[0]![2]).toEqual([1]);
    expect(drawn).toEqual([2]);
    expect(result.pagesExported).toBe(2);
    expect(result.receipt?.kept.join(' ')).toContain('Page 2 is a scan or drawing');
    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/<w:drawing>/g)).toHaveLength(1);
    expect(xml).toContain('continued to the date below');
  });
});

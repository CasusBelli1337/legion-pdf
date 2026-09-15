/// <reference types="node" />
/**
 * The whole pipeline against the REAL fixtures: pdfjs (Node build) reads the
 * page, the selection engine classifies it, the extractor builds the layout,
 * core/export builds the .docx, and the result is unzipped and checked. The
 * .docx files are also written to qa/output/docx-export/ (gitignored) so the
 * fidelity pass can render them in real Word beside the source PDF.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildDocx } from '@core/export';
import type { PageLayout } from '@shared/types';
import { createSelectCopyEngine } from '@renderer/features/select-copy/engine';
import { createPdfjsSource } from '@renderer/features/select-copy/pdfjs-source';
import { extractPageLayout } from './extract-page-layout';
import type { PageLike, RasterizedImage } from './extract-page-layout';
import { rolesOf } from './page-roles';
import { encodeRgbPng } from './test-png';

const ROOT = path.join(import.meta.dirname, '../../..');
const FIXTURES = path.join(ROOT, 'qa/fixtures');
const OUTPUT = path.join(ROOT, 'qa/output/docx-export');
const STANDARD_FONTS = path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/');
const built = existsSync(path.join(FIXTURES, 'pleading-fixture.pdf'));

interface PdfJsLike {
  OPS: Readonly<Record<string, number>>;
  getDocument(parameters: {
    data: Uint8Array;
    useSystemFonts: boolean;
    standardFontDataUrl: string;
    isOffscreenCanvasSupported: boolean;
  }): { promise: Promise<PdfJsDocument> };
}

interface PdfJsDocument {
  numPages: number;
  getPage(page: number): Promise<unknown>;
  loadingTask: { destroy(): Promise<void> };
}

async function pdfjs(): Promise<PdfJsLike> {
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
}

async function openBytes(bytes: Uint8Array) {
  const { getDocument } = await pdfjs();
  // pdfjs takes the buffer with it; the caller's copy stays whole.
  return getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONTS,
    isOffscreenCanvasSupported: false,
  }).promise;
}

/** Node has no canvas: pdfjs hands raw pixels, which core's PNG encoder takes. */
async function rasterizeInNode(image: unknown): Promise<RasterizedImage | null> {
  const { width, height, kind, data } = image as {
    width: number;
    height: number;
    kind?: number;
    data?: Uint8ClampedArray;
  };
  if (data === undefined) return null;
  const rgb = new Uint8Array(width * height * 3);
  const stride = kind === 3 ? 4 : 3;
  if (kind !== 2 && kind !== 3) return null;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb.set(data.subarray(pixel * stride, pixel * stride + 3), pixel * 3);
  }
  return {
    png: encodeRgbPng({ widthPx: width, heightPx: height, rgb }),
    widthPx: width,
    heightPx: height,
  };
}

async function layoutsOf(bytes: Uint8Array): Promise<PageLayout[]> {
  const { OPS } = await pdfjs();
  const document = await openBytes(bytes);
  const engine = createSelectCopyEngine(createPdfjsSource(document as never, 'fixture'));
  const layouts: PageLayout[] = [];
  for (let page = 1; page <= document.numPages; page += 1) {
    const classification = await engine.classifyPage(page);
    const pdfPage = (await document.getPage(page)) as unknown as PageLike;
    layouts.push(
      await extractPageLayout(pdfPage, {
        page,
        ops: OPS as unknown as Readonly<Record<string, number>>,
        roles: rolesOf(classification),
        printedPageNumber: classification.printedPageNumber,
        rasterize: rasterizeInNode,
      })
    );
  }
  await document.loadingTask.destroy();
  return layouts;
}

async function exportFixture(name: string, bytes: Uint8Array) {
  const layouts = await layoutsOf(bytes);
  const build = await buildDocx(layouts, { title: name });
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(path.join(OUTPUT, `${name}.docx`), build.bytes);
  await writeFile(path.join(OUTPUT, `${name}.pdf`), bytes);
  const zip = await JSZip.loadAsync(build.bytes);
  const read = async (entry: string) => (await zip.file(entry)?.async('string')) ?? '';
  return {
    layouts,
    build,
    document: await read('word/document.xml'),
    header: await read('word/header1.xml'),
    footer: await read('word/footer1.xml'),
  };
}

/** A letter with a paragraph, a bold heading, and a real picture, built here. */
async function pictureFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const rgb = new Uint8Array(120 * 60 * 3);
  for (let pixel = 0; pixel < 120 * 60; pixel += 1) {
    rgb.set([(pixel % 120) * 2, 80, 200 - Math.floor(pixel / 120) * 3], pixel * 3);
  }
  const png = await pdf.embedPng(encodeRgbPng({ widthPx: 120, heightPx: 60, rgb }));
  const page = pdf.addPage([612, 792]);
  page.drawText('EXHIBIT INDEX', { x: 236, y: 720, size: 16, font: bold });
  page.drawText('The parties stipulated that the photograph below was taken on the date', {
    x: 72,
    y: 680,
    size: 12,
    font: times,
  });
  page.drawText('shown and fairly depicts the intersection as it appeared that morning.', {
    x: 72,
    y: 664,
    size: 12,
    font: times,
  });
  page.drawImage(png, { x: 72, y: 520, width: 240, height: 120 });
  page.drawText('Counsel for the defendant reserved all objections as to foundation.', {
    x: 72,
    y: 480,
    size: 12,
    font: times,
  });
  return pdf.save();
}

describe.skipIf(!built)('Word export of the real fixtures', () => {
  it('pleading-fixture.pdf: body text flows, line numbers become Word numbering, head and foot are real', async () => {
    const bytes = new Uint8Array(await readFile(path.join(FIXTURES, 'pleading-fixture.pdf')));
    const { layouts, build, document, header, footer } = await exportFixture(
      'pleading-fixture',
      bytes
    );
    expect(layouts).toHaveLength(8);
    expect(layouts[2]?.runs.some((run) => run.role === 'line-number')).toBe(true);
    expect(document).toContain('only the signature page that Mr. Pemberton');
    expect(document).toContain('w:lnNumType');
    expect(document).toContain('w:rFonts w:ascii="Times New Roman"');
    expect(header).toContain('ASHFORD v. ASHFORD');
    expect(footer).toContain('PAGE');
    expect(build.notes.join(' ')).toMatch(/line numbering/);
    expect(build.notes.join(' ')).toMatch(/Bates/);
  });

  it('condensed-transcript.pdf: every mini-page line survives as text', async () => {
    const bytes = new Uint8Array(await readFile(path.join(FIXTURES, 'condensed-transcript.pdf')));
    const { document } = await exportFixture('condensed-transcript', bytes);
    expect(document).toContain('w:orient="landscape"');
    expect(document.match(/<w:p[ >]/g)?.length ?? 0).toBeGreaterThan(20);
  });

  it('exhibit-part-a.pdf: a centred Helvetica label on each page, each page on its own', async () => {
    const bytes = new Uint8Array(await readFile(path.join(FIXTURES, 'exhibit-part-a.pdf')));
    const { document, build } = await exportFixture('exhibit-part-a', bytes);
    expect(build.pageCount).toBe(2);
    expect(document).toContain('FILE EXHIBIT-PART-A.PDF PAGE 1 OF 2');
    expect(document).toContain('w:rFonts w:ascii="Arial"');
    expect(document).toContain('w:sz w:val="36"');
    expect(document.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  });

  it('a letter with a photograph: the picture is embedded inline where it sat', async () => {
    const { document, layouts, build } = await exportFixture(
      'picture-letter',
      await pictureFixture()
    );
    expect(layouts[0]?.images).toHaveLength(1);
    expect(layouts[0]?.images[0]?.rect).toMatchObject({ x: 72, y: 520, width: 240, height: 120 });
    expect(document).toContain('<wp:extent');
    expect(document).toContain('EXHIBIT INDEX');
    expect(document).toMatch(/<w:b\/>.{0,300}EXHIBIT INDEX/);
    expect(build.notes).toEqual([]);
  });
});

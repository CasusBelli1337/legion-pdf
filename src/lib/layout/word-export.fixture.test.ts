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
import { layoutsOf } from './node-pipeline.testkit';
import { encodeRgbPng } from './test-png';

const ROOT = path.join(import.meta.dirname, '../../..');
const FIXTURES = path.join(ROOT, 'qa/fixtures');
const OUTPUT = path.join(ROOT, 'qa/output/docx-export');
const built = existsSync(path.join(FIXTURES, 'pleading-fixture.pdf'));

async function exportFixture(name: string, bytes: Uint8Array) {
  const layouts = await layoutsOf(bytes);
  const build = await buildDocx(layouts, { title: name });
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(path.join(OUTPUT, `${name}.docx`), build.bytes);
  await writeFile(path.join(OUTPUT, `${name}.pdf`), bytes);
  const zip = await JSZip.loadAsync(build.bytes);
  const read = async (entry: string) => (await zip.file(entry)?.async('string')) ?? '';
  const headers = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name));
  const footers = Object.keys(zip.files).filter((name) => /^word\/footer\d+\.xml$/.test(name));
  return {
    layouts,
    build,
    document: await read('word/document.xml'),
    header: (await Promise.all(headers.map(read))).join('\n'),
    footer: (await Promise.all(footers.map(read))).join('\n'),
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
  it('pleading-fixture.pdf: body text flows, line numbers become a header table, head and foot are real', async () => {
    const bytes = new Uint8Array(await readFile(path.join(FIXTURES, 'pleading-fixture.pdf')));
    const { layouts, build, document, header, footer } = await exportFixture(
      'pleading-fixture',
      bytes
    );
    expect(layouts).toHaveLength(8);
    expect(layouts[2]?.runs.some((run) => run.role === 'line-number')).toBe(true);
    expect(document).toContain('only the signature page that Mr. Pemberton');
    expect(document).not.toContain('w:lnNumType');
    expect(document).toContain('w:rFonts w:ascii="Times New Roman"');
    expect(header).toContain('ASHFORD v. ASHFORD');
    expect(header).toMatch(/<w:t[^>]*>28<\/w:t>/);
    expect(footer).toContain('PAGE');
    expect(build.notes.join(' ')).toMatch(/line numbers and rules/);
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

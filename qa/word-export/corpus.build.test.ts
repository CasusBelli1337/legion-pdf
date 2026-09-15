/// <reference types="node" />
/**
 * Builds the Word-export corpus from REAL producers (`npm run corpus:word`):
 * Word prints the three generated documents to PDF, one of them is
 * print-and-scanned into a raster PDF, and that scan is given Legion PDF's own
 * OCR text layer. The PDFs land in qa/fixtures/word-export/ with a manifest of
 * page and word counts, which is the ground truth the fidelity suite reads.
 * Runs only when asked (WORD_CORPUS=1) and only with Word reachable.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { wordsOf } from './bbox';
import { CORPUS } from './fixtures';
import { recognizeScannedPages, tesseractReachable } from './ocr';
import { pageCountOf, popplerReachable, renderWithWord, wordReachable } from './word-render';

const run = promisify(execFile);
const HERE = import.meta.dirname;
const ROOT = path.join(HERE, '../..');
const OUT = path.join(ROOT, 'qa/fixtures/word-export');
const TEMPLATE =
  process.env.LEGION_CA_TEMPLATE ??
  path.join(
    homedir(),
    'projects/legion-law/repo/apps/app/async_tasks/document_drafter/templates/mpa-builder/ca.docx'
  );

const asked = process.env.WORD_CORPUS === '1';
const ready = asked && wordReachable() && popplerReachable() && tesseractReachable();

/** The three Word-made documents, printed to PDF by Word. */
async function wordMade(scratch: string): Promise<Record<string, string>> {
  const docx = {
    'pleading-word': path.join(scratch, 'pleading-word.docx'),
    'filing-mixed': path.join(scratch, 'filing-mixed.docx'),
    'deposition-word': path.join(scratch, 'deposition-word.docx'),
  };
  if (!existsSync(TEMPLATE)) throw new Error(`Legion CA template not found at ${TEMPLATE}`);
  await run('python3', [
    path.join(HERE, 'fill-pleading-template.py'),
    TEMPLATE,
    docx['pleading-word'],
  ]);
  await run('node', [path.join(HERE, 'make-filing.mjs'), docx['filing-mixed']]);
  await run('node', [path.join(HERE, 'make-deposition.mjs'), docx['deposition-word']]);
  const pdfs: Record<string, string> = {};
  for (const [name, file] of Object.entries(docx)) pdfs[name] = await renderWithWord(file, scratch);
  return pdfs;
}

/** A print-and-scan round trip: 200 dpi grayscale JPEGs, one per page, no text. */
async function scanned(sourcePdf: string, scratch: string): Promise<string> {
  const prefix = path.join(scratch, 'scan');
  await run('pdftoppm', [
    '-r',
    '200',
    '-gray',
    '-jpeg',
    '-jpegopt',
    'quality=80',
    sourcePdf,
    prefix,
  ]);
  const jpegs = (await readdir(scratch))
    .filter((name) => name.startsWith('scan-') && name.endsWith('.jpg'))
    .sort();
  const pdf = await PDFDocument.create();
  pdf.setProducer('Fictional Scanner 3000');
  pdf.setCreator('Fictional Scanner 3000');
  for (const name of jpegs) {
    const image = await pdf.embedJpg(await readFile(path.join(scratch, name)));
    const page = pdf.addPage([612, 792]);
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  }
  const out = path.join(scratch, 'pleading-scan.pdf');
  await writeFile(out, await pdf.save());
  return out;
}

describe.skipIf(!ready)('Word-export corpus', () => {
  it('builds every fixture from a real producer and records the ground truth', async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'wx-corpus-'));
    const pdfs = await wordMade(scratch);
    pdfs['pleading-scan'] = await scanned(pdfs['pleading-word'] as string, scratch);
    const scanBytes = new Uint8Array(await readFile(pdfs['pleading-scan']));
    const ocr = await recognizeScannedPages(scanBytes, pdfs['pleading-scan']);
    expect(ocr.recognized).toHaveLength(await pageCountOf(pdfs['pleading-scan']));
    for (const words of ocr.wordsPerPage) expect(words).toBeGreaterThan(80);
    pdfs['pleading-scan-ocr'] = path.join(scratch, 'pleading-scan-ocr.pdf');
    await writeFile(pdfs['pleading-scan-ocr'], ocr.bytes);

    await mkdir(OUT, { recursive: true });
    const manifest: Record<string, unknown> = {};
    for (const fixture of CORPUS) {
      const source = pdfs[fixture.name];
      if (source === undefined) throw new Error(`No producer built ${fixture.name}`);
      const target = path.join(OUT, `${fixture.name}.pdf`);
      await copyFile(source, target);
      const pages = await wordsOf(target);
      const wordsPerPage = pages.map((page) => page.words.length);
      manifest[`${fixture.name}.pdf`] = {
        producer: fixture.producer,
        purpose: fixture.purpose,
        pages: pages.length,
        wordsPerPage,
      };
      expect(pages.length).toBeGreaterThan(0);
      if (fixture.name !== 'pleading-scan')
        for (const count of wordsPerPage) expect(count).toBeGreaterThan(0);
    }
    await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  });
});

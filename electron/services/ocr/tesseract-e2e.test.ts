/**
 * END TO END, against the REAL Tesseract binary.
 *
 * Builds a genuine scan (a PDF whose only content is a picture of text), proves
 * the detector calls it text-free, runs the actual worker pool over the actual
 * binary, and proves the resulting document is searchable by reading it back
 * with pdfjs — the engine the Librarius viewer uses.
 *
 * The renderer's canvas does not exist in Node, so `pdftoppm` (poppler) stands
 * in for `src/lib/rasterize.ts` here. The suite skips itself, loudly named, on
 * a machine without Tesseract or poppler; Windows coverage is the live QA pass.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { detectTextLayer } from '@core/ocr';
import { extractAllText } from '@core/ocr/pdfjs-extract.testkit';
import { OcrService } from './ocr-service';
import { resolveTesseract } from './tesseract-binary';

/** Tesseract must actually answer `--version`; that is the binary contract. */
function tesseractAnswers(command: string): boolean {
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8' });
  return probe.error === undefined && probe.status === 0;
}

/** poppler's pdftoppm has no --version; spawnability is the whole question. */
function canSpawn(command: string, args: string[]): boolean {
  return spawnSync(command, args, { encoding: 'utf8' }).error === undefined;
}

const TESSERACT = resolveTesseract({
  platform: process.platform,
  isPackaged: false,
  resourcesPath: join(process.cwd(), 'resources'),
  appRoot: process.cwd(),
  envPath: process.env.LIBRARIUS_TESSERACT_PATH,
  exists: existsSync,
});

const TOOLS_PRESENT = tesseractAnswers(TESSERACT.command) && canSpawn('pdftoppm', ['-v']);

const HEADLINE = 'IN THE SUPERIOR COURT OF THE STATE OF CALIFORNIA';
const BODY = [
  'Plaintiff moves this Court for an order compelling further responses',
  'to the second set of requests for production of documents served on',
  'the defendant, and for monetary sanctions in the amount stated below.',
];

let workspace = '';

async function rasterize(pdf: Uint8Array, page: number, dpi: number): Promise<Uint8Array> {
  const directory = await mkdtemp(join(workspace, 'raster-'));
  const source = join(directory, 'in.pdf');
  await writeFile(source, pdf);
  const result = spawnSync(
    'pdftoppm',
    [
      '-r',
      String(dpi),
      '-png',
      '-f',
      String(page),
      '-l',
      String(page),
      source,
      join(directory, 'p'),
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`pdftoppm failed: ${result.stderr}`);
  const produced = (await readdir(directory)).find((name) => name.endsWith('.png'));
  if (produced === undefined) throw new Error('pdftoppm produced no PNG.');
  return new Uint8Array(await readFile(join(directory, produced)));
}

/** A born-digital page, then a picture of that page: a real scan. */
async function scannedPdf(): Promise<Uint8Array> {
  const typed = await PDFDocument.create();
  const page = typed.addPage([612, 792]);
  const font = await typed.embedFont(StandardFonts.TimesRoman);
  page.drawText(HEADLINE, { x: 60, y: 700, size: 16, font });
  BODY.forEach((line, index) => {
    page.drawText(line, { x: 60, y: 640 - index * 28, size: 14, font });
  });

  const png = await rasterize(await typed.save(), 1, 200);
  const scan = await PDFDocument.create();
  const scanPage = scan.addPage([612, 792]);
  const image = await scan.embedPng(png);
  scanPage.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  return scan.save();
}

function normalize(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function recall(expected: string[], actual: string[]): number {
  const pool = [...actual];
  const matched = expected.filter((token) => {
    const index = pool.indexOf(token);
    if (index === -1) return false;
    pool.splice(index, 1);
    return true;
  });
  return matched.length / expected.length;
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'librarius-ocr-e2e-'));
});

afterAll(async () => {
  if (workspace !== '') await rm(workspace, { recursive: true, force: true });
});

describe.skipIf(!TOOLS_PRESENT)('OCR end to end with the real Tesseract binary', () => {
  it('turns a scan into a searchable document with at least 95% word recall', async () => {
    const scan = await scannedPdf();

    const before = await detectTextLayer(scan);
    expect(before.pagesNeedingOcr).toEqual([1]);

    const service = new OcrService({
      requestRaster: async ({ page, dpi }) => {
        const png = await rasterize(scan, page, dpi);
        return { requestId: 'e2e', png, widthPx: dpi * 8.5, heightPx: dpi * 11 };
      },
      emitProgress: () => undefined,
      locate: () => TESSERACT,
      cpuCount: () => 4,
      tempRoot: workspace,
    });

    const result = await service.run('e2e', scan, { pages: [1], language: 'eng', dpi: 300 });

    expect(result.pagesIn).toBe(1);
    expect(result.pagesOut).toBe(1);
    expect(result.detail.pagesOcred).toEqual([1]);
    expect(result.detail.charsPerPage[0]).toBeGreaterThan(100);

    const after = await detectTextLayer(result.bytes);
    expect(after.pagesWithText).toEqual([1]);

    const [extracted = ''] = await extractAllText(result.bytes, 1);
    const expected = normalize([HEADLINE, ...BODY].join(' '));
    const accuracy = recall(expected, normalize(extracted));
    // eslint-disable-next-line no-console
    console.log(`[ocr e2e] recall ${(accuracy * 100).toFixed(1)}% | extracted: ${extracted}`);
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
    expect(extracted.toUpperCase()).toContain('SUPERIOR COURT');
  }, 120_000);
});

describe.skipIf(TOOLS_PRESENT)('OCR end to end', () => {
  it.skip('needs Tesseract and poppler on PATH — covered by the Windows live QA pass', () => {
    expect(TOOLS_PRESENT).toBe(false);
  });
});

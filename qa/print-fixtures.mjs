/**
 * Fixtures for the print page-count proof (qa/print-proof.mjs).
 *
 * WHY a separate set: the print bug is a PAPER-GEOMETRY bug — a page image
 * whose height at full sheet width lands taller than the sheet spills onto a
 * second, near-blank sheet. Proving that needs documents whose page boxes are
 * NOT Letter-shaped (Legal, landscape, a mixed run), which the live-QA fixture
 * set does not have.
 *
 * Run: node qa/print-fixtures.mjs
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, 'fixtures', 'print');

const LETTER = [612, 792];
const LEGAL = [612, 1008];
const LANDSCAPE = [792, 612];

/**
 * Ground truth every proof run asserts against. `boxes` = first page size.
 *
 * `legacySheets` is what the PRE-FIX print.css actually printed, measured
 * against the 2026-09-15 build before the fix landed. The proof's legacy arm
 * has to still reproduce these numbers, or it has stopped reproducing the bug
 * and is no longer evidence of anything.
 *
 * Landscape is the one that never doubled: an 11x8.5 image at full sheet width
 * is SHORTER than a portrait sheet, so it had nothing to spill. That is why
 * Arthur only ever saw this on ordinary portrait filings.
 */
export const PRINT_FIXTURES = {
  'print-letter-15.pdf': { pages: 15, size: 'Letter 8.5x11', boxes: LETTER, legacySheets: 30 },
  'print-legal-6.pdf': { pages: 6, size: 'Legal 8.5x14', boxes: LEGAL, legacySheets: 12 },
  'print-landscape-5.pdf': {
    pages: 5,
    size: 'Letter landscape 11x8.5',
    boxes: LANDSCAPE,
    legacySheets: 5,
  },
  'print-mixed-8.pdf': {
    pages: 8,
    size: 'mixed Letter/Legal/landscape',
    boxes: LETTER,
    legacySheets: 12,
  },
};

const PAGE_BOXES = {
  'print-letter-15.pdf': repeat(LETTER, 15),
  'print-legal-6.pdf': repeat(LEGAL, 6),
  'print-landscape-5.pdf': repeat(LANDSCAPE, 5),
  'print-mixed-8.pdf': [LETTER, LETTER, LEGAL, LANDSCAPE, LETTER, LEGAL, LANDSCAPE, LETTER],
};

function repeat(box, count) {
  return Array.from({ length: count }, () => box);
}

async function build(name, boxes) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle(name);
  for (const [index, box] of boxes.entries()) {
    const page = doc.addPage(box);
    const { width, height } = page.getSize();
    // A full-bleed border: a sheet that comes out of the printer with no border
    // on it is the spill this proof exists to catch.
    page.drawRectangle({
      x: 12,
      y: 12,
      width: width - 24,
      height: height - 24,
      borderColor: rgb(0, 0, 0),
      borderWidth: 3,
    });
    page.drawText(`PRINT PAGE ${index + 1} OF ${boxes.length}`, {
      x: 48,
      y: height - 96,
      size: 28,
      font,
    });
    page.drawText(`${Math.round(width)} x ${Math.round(height)} pt`, {
      x: 48,
      y: height - 140,
      size: 16,
      font,
    });
    page.drawText(`bottom of page ${index + 1}`, { x: 48, y: 36, size: 14, font });
  }
  await writeFile(path.join(OUT, name), await doc.save());
}

/** Count verification: a fixture that under-produced would make the proof lie. */
async function verify() {
  const files = (await readdir(OUT)).filter((file) => file.endsWith('.pdf'));
  const expected = Object.keys(PRINT_FIXTURES).length;
  if (files.length !== expected) {
    throw new Error(
      `Expected ${expected} print fixtures, got ${files.length}: ${files.join(', ')}`
    );
  }
  for (const file of files) {
    if ((await stat(path.join(OUT, file))).size === 0) throw new Error(`Empty fixture: ${file}`);
    const loaded = await PDFDocument.load(await readFile(path.join(OUT, file)));
    const want = PRINT_FIXTURES[file].pages;
    if (loaded.getPageCount() !== want) {
      throw new Error(`${file}: wrote ${loaded.getPageCount()} pages, expected ${want}`);
    }
  }
  return files.length;
}

export async function buildPrintFixtures() {
  await mkdir(OUT, { recursive: true });
  for (const [name, boxes] of Object.entries(PAGE_BOXES)) await build(name, boxes);
  return verify();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = await buildPrintFixtures();
  process.stdout.write(`OK - ${count} print fixtures in qa/fixtures/print/\n`);
}

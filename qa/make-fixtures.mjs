/**
 * Generates the live-QA fixture set into qa/fixtures/ (gitignored).
 * Every fixture has KNOWN ground truth recorded in qa/fixtures/manifest.json
 * so the QA pass verifies against facts, not vibes.
 *
 * Run: node qa/make-fixtures.mjs
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, 'fixtures');
const manifest = {};

const LOREM =
  'The deposition of the witness was taken pursuant to notice under Code of Civil Procedure section 2025.010. ' +
  'Counsel stipulated on the record that objections other than as to form are preserved. ';

async function pleading500() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let p = 1; p <= 500; p++) {
    const page = doc.addPage([612, 792]);
    page.drawText(
      `ASHFORD v. RAKIB — DEPOSITION TRANSCRIPT — PAGE MARKER P${String(p).padStart(4, '0')}`,
      {
        x: 72,
        y: 730,
        size: 11,
        font,
      }
    );
    for (let line = 0; line < 30; line++) {
      page.drawText(`${p}:${line + 1}  ${LOREM.slice(0, 90)}`, {
        x: 72,
        y: 700 - line * 20,
        size: 9,
        font,
      });
    }
  }
  const bytes = await doc.save();
  await writeFile(path.join(OUT, 'pleading-500.pdf'), bytes);
  manifest['pleading-500.pdf'] = {
    pages: 500,
    purpose: 'perf scroll/zoom, Bates, watermark, page numbers, print',
    groundTruth: {
      firstPageMarker: 'P0001',
      lastPageMarker: 'P0500',
      markerFormat: 'PAGE MARKER P####',
    },
  };
}

async function exhibitParts() {
  const sizes = { 'exhibit-part-a.pdf': 2, 'exhibit-part-b.pdf': 3, 'exhibit-part-c.pdf': 4 };
  for (const [name, count] of Object.entries(sizes)) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.setTitle(name);
    for (let p = 1; p <= count; p++) {
      const page = doc.addPage([612, 792]);
      page.drawText(`FILE ${name.toUpperCase()} PAGE ${p} OF ${count}`, {
        x: 72,
        y: 396,
        size: 18,
        font,
      });
    }
    await writeFile(path.join(OUT, name), await doc.save());
  }
  manifest['exhibit-parts'] = {
    files: sizes,
    purpose: 'combine (expect 9 pages in order), split, reorder, exhibit stamps, slip sheets',
    groundTruth: { combinedPages: 9 },
  };
}

async function redactTarget() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const secrets = ['SSN 545-45-6789', 'ACCT-99887766', 'PRIVILEGED-DRAFT-NOTE-X7'];
  for (let p = 0; p < 4; p++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Financial record page ${p + 1}. Client identifier follows.`, {
      x: 72,
      y: 700,
      size: 12,
      font,
    });
    page.drawText(secrets[p % secrets.length], { x: 72, y: 650, size: 12, font });
    page.drawText('Non-confidential closing paragraph that must SURVIVE redaction.', {
      x: 72,
      y: 600,
      size: 12,
      font,
    });
  }
  await writeFile(path.join(OUT, 'redact-target.pdf'), await doc.save());
  manifest['redact-target.pdf'] = {
    pages: 4,
    purpose: 'true redaction + search-redact + verification',
    groundTruth: { mustDestroy: secrets, mustSurvive: 'SURVIVE redaction' },
  };
}

async function metadataLaden() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle('CONFIDENTIAL DRAFT - internal only');
  doc.setAuthor('Arthur Rothrock');
  doc.setSubject('Settlement strategy');
  doc.setProducer('Legion Draft System 9.9');
  doc.setCreator('legion-internal');
  doc.setKeywords(['settlement', 'strategy', 'privileged']);
  const page = doc.addPage([612, 792]);
  page.drawText('Body text is public. Metadata above must be scrubbed.', {
    x: 72,
    y: 396,
    size: 14,
    font,
  });
  await writeFile(path.join(OUT, 'metadata-laden.pdf'), await doc.save());
  manifest['metadata-laden.pdf'] = {
    pages: 1,
    purpose: 'metadata scrub verification (raw-byte check)',
    groundTruth: {
      mustVanish: [
        'Arthur Rothrock',
        'Settlement strategy',
        'Legion Draft System 9.9',
        'privileged',
      ],
    },
  };
}

async function scannedDeposition() {
  // Build a 6-page text PDF, rasterize it with poppler, rebuild image-only:
  // a true "scan" with zero text layer — the OCR acceptance fixture.
  const { execFileSync } = await import('node:child_process');
  const { readFile, rm } = await import('node:fs/promises');
  const src = await PDFDocument.create();
  const font = await src.embedFont(StandardFonts.TimesRoman);
  const knownLines = [];
  for (let p = 1; p <= 6; p++) {
    const page = src.addPage([612, 792]);
    const line = `SCANNED EXHIBIT PAGE ${p} WITNESS ANSWERED YES ON QUESTION ${p * 7}`;
    knownLines.push(line);
    page.drawText(line, { x: 72, y: 700, size: 16, font });
    page.drawText('The quick brown fox jumps over the lazy dog 0123456789.', {
      x: 72,
      y: 650,
      size: 14,
      font,
    });
  }
  const tmpPdf = path.join(OUT, '_scan-src.pdf');
  await writeFile(tmpPdf, await src.save());
  execFileSync('pdftoppm', ['-png', '-r', '200', tmpPdf, path.join(OUT, '_scan')]);
  const out = await PDFDocument.create();
  for (let p = 1; p <= 6; p++) {
    const png = await out.embedPng(await readFile(path.join(OUT, `_scan-${p}.png`)));
    const page = out.addPage([612, 792]);
    page.drawImage(png, { x: 0, y: 0, width: 612, height: 792 });
    await rm(path.join(OUT, `_scan-${p}.png`));
  }
  await rm(tmpPdf);
  await writeFile(path.join(OUT, 'scanned-deposition.pdf'), await out.save());
  manifest['scanned-deposition.pdf'] = {
    pages: 6,
    purpose: 'OCR: image-only input, must become searchable',
    groundTruth: { mustFindAfterOcr: knownLines, hasTextLayerBefore: false },
  };
}

await mkdir(OUT, { recursive: true });
await pleading500();
await scannedDeposition();
await exhibitParts();
await redactTarget();
await metadataLaden();
await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Count-verification gate (house rule: no silent under-production)
const { readdir, stat } = await import('node:fs/promises');
const files = await readdir(OUT);
if (files.length !== 8)
  throw new Error(`Expected 8 fixture files, got ${files.length}: ${files.join(', ')}`);
for (const f of files) {
  const s = await stat(path.join(OUT, f));
  if (s.size === 0) throw new Error(`Empty fixture: ${f}`);
}
process.stdout.write(`OK — ${files.length} fixtures written to qa/fixtures/\n`);

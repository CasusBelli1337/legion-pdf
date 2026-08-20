/**
 * The two fixtures the selection-intelligence lane is graded against, kept out
 * of make-fixtures.mjs only because that file is at its size limit.
 *
 * Both are built to a KNOWN geometry — the same geometry the classifier's unit
 * tests use — so the manifest can record what a given drag must copy and what
 * cite it must produce, and the live QA pass checks a string rather than a
 * feeling. Two things are deliberately awkward about them:
 *
 *   pleading-fixture.pdf   two front sheets before the numbering starts, so the
 *                          PRINTED page number is never the PDF index; and a
 *                          word broken across lines 2 and 3, so de-hyphenation
 *                          has something to heal.
 *   condensed-transcript.pdf  four mini-pages per sheet, each with its OWN 1-25
 *                          line column and its own printed number — the layout
 *                          that turns a naive copy into interleaved nonsense.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const LETTER = [612, 792];
const LANDSCAPE = [792, 612];

/* ── pleading paper ──────────────────────────────────────────────────── */

const PLEADING_TOP = 720;
const PLEADING_LEADING = 24;
const RUNNING_HEAD = 'ASHFORD v. ASHFORD — DEPOSITION OF JAMES ASHFORD';

/**
 * Line 2 ends mid-word so line 3 completes it: "signa-" + "ture" = "signature".
 * Only line 1 carries the page marker, and it is spelled in WORDS — a stray
 * bare integer in the body would be a second thing that looks like a line
 * number, and the fixture is supposed to test the classifier, not trap it.
 */
const PAGE_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

const SCRIPT = [
  'Q. On transcript page WORD, did you review the trust instrument?',
  'A. I did not read the whole document, only the signa-',
  'ture page that Mr. Pemberton put in front of me.',
  'Q. And no one read the rest of it to you?',
  'A. No one did.',
  '',
  'Q. Turning to the second amendment, had you seen it',
  'before the date printed on its signature page?',
];

function smartCopyExpected(printed) {
  return (
    `Q. On transcript page ${PAGE_WORDS[printed]}, did you review the trust instrument? ` +
    'A. I did not read the whole document, only the signature page that ' +
    'Mr. Pemberton put in front of me.'
  );
}

function drawPleadingPage(page, fonts, options) {
  page.drawText(RUNNING_HEAD, { x: 90, y: 760, size: 9, font: fonts.roman });
  for (let line = 1; line <= 28; line += 1) {
    const y = PLEADING_TOP - (line - 1) * PLEADING_LEADING;
    page.drawText(String(line), { x: 54, y, size: 10, font: fonts.roman });
    const text = options.lines[line - 1];
    if (text === undefined || text === '') continue;
    page.drawText(text, { x: 90, y, size: 11, font: fonts.roman });
  }
  page.drawText(options.bates, { x: 430, y: 30, size: 9, font: fonts.mono });
  if (options.printed !== null) {
    page.drawText(String(options.printed), { x: 300, y: 44, size: 10, font: fonts.roman });
  }
}

function linesForPage(printed) {
  if (printed === null) return ['COVER SHEET — NOT NUMBERED', 'This sheet carries no page number.'];
  return SCRIPT.map((line) => line.replace('WORD', PAGE_WORDS[printed]));
}

export async function pleadingFixture(out, manifest) {
  const doc = await PDFDocument.create();
  const fonts = {
    roman: await doc.embedFont(StandardFonts.TimesRoman),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  for (let index = 1; index <= 8; index += 1) {
    const printed = index <= 2 ? null : index - 2;
    drawPleadingPage(doc.addPage(LETTER), fonts, {
      printed,
      lines: linesForPage(printed),
      bates: `ASHFORD00012${index}`,
    });
  }
  await writeFile(path.join(out, 'pleading-fixture.pdf'), await doc.save());

  manifest['pleading-fixture.pdf'] = {
    pages: 8,
    purpose:
      'selection intelligence: line-number stripping, printed-vs-PDF page numbers, ' +
      'de-hyphenation, flowing copy, record cites',
    groundTruth: {
      printedPageByPdfIndex: { 1: null, 2: null, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6 },
      runningHead: RUNNING_HEAD,
      batesFormat: 'ASHFORD00012#',
      lineNumbersPerPage: 28,
      smartCopy: {
        pdfPage: 3,
        selectLines: [1, 3],
        expected: smartCopyExpected(1),
        note: 'body only — no margin numbers, no running head, no Bates; line 2/3 de-hyphenated',
      },
      cites: [
        { pdfPage: 3, selectLines: [1, 3], expected: '(1:1-3)' },
        { pdfPage: 3, selectLines: [5, 5], expected: '(1:5)' },
        { pdfPage: 8, selectLines: [1, 5], expected: '(6:1-5)' },
        {
          pdfPage: 3,
          selectLines: [1, 3],
          prefix: 'Ashford Depo.',
          expected: '(Ashford Depo. 1:1-3)',
        },
      ],
      crossPageCite: {
        from: { pdfPage: 3, line: 8 },
        to: { pdfPage: 4, line: 2 },
        expected: '(1:8-2:2)',
      },
    },
  };
}

/* ── condensed transcript ────────────────────────────────────────────── */

const MINI_ORIGINS = [
  { x: 0, y: 306 },
  { x: 0, y: 0 },
  { x: 396, y: 306 },
  { x: 396, y: 0 },
];

const MINI_TOP = 270;
const MINI_LEADING = 10;
const MINI_LINES = 25;

function drawMiniPage(page, font, origin, number) {
  page.drawText(String(number), { x: origin.x + 330, y: origin.y + 285, size: 8, font });
  for (let line = 1; line <= MINI_LINES; line += 1) {
    const y = origin.y + MINI_TOP - (line - 1) * MINI_LEADING;
    page.drawText(String(line), { x: origin.x + 20, y, size: 7, font });
    page.drawText(miniLineText(number, line), { x: origin.x + 40, y, size: 7, font });
  }
}

function miniLineText(number, line) {
  if (line === 1) return `Q. Page ${number} line one of the condensed transcript.`;
  if (line === 2) return `A. Page ${number} line two, continuing the same answer.`;
  return `Page ${number} line ${line} of testimony on this mini-page.`;
}

export async function condensedTranscript(out, manifest) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let sheet = 0; sheet < 4; sheet += 1) {
    const page = doc.addPage(LANDSCAPE);
    MINI_ORIGINS.forEach((origin, quadrant) => {
      drawMiniPage(page, font, origin, 41 + sheet * 4 + quadrant);
    });
  }
  await writeFile(path.join(out, 'condensed-transcript.pdf'), await doc.save());

  manifest['condensed-transcript.pdf'] = {
    pages: 4,
    purpose:
      'selection intelligence on a 4-up condensed sheet: four independent line ' +
      'columns, per-mini-page numbers, reading order, mini-page cites',
    groundTruth: {
      sheets: 4,
      miniPagesPerSheet: 4,
      linesPerMiniPage: MINI_LINES,
      quadrantReadingOrder: ['top-left', 'bottom-left', 'top-right', 'bottom-right'],
      miniPageNumbersByPdfPage: {
        1: [41, 42, 43, 44],
        2: [45, 46, 47, 48],
        3: [49, 50, 51, 52],
        4: [53, 54, 55, 56],
      },
      smartCopy: {
        pdfPage: 1,
        miniPage: 42,
        selectLines: [1, 2],
        expected:
          'Q. Page 42 line one of the condensed transcript. ' +
          'A. Page 42 line two, continuing the same answer.',
      },
      cites: [
        { pdfPage: 1, miniPage: 42, selectLines: [1, 1], expected: '(42:1)' },
        { pdfPage: 2, miniPage: 46, selectLines: [3, 9], expected: '(46:3-9)' },
        {
          pdfPage: 1,
          from: { miniPage: 42, line: 25 },
          to: { miniPage: 43, line: 1 },
          expected: '(42:25-43:1)',
        },
      ],
    },
  };
}

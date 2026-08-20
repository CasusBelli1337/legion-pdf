/**
 * THE WRAP PROOF: the lines the attorney sees inside the drawn box are the
 * lines the FILE gets.
 *
 * src/features/text/text-geometry.test.ts proves the two widths agree to six
 * decimal places, and it did not catch the bug this file exists for, because it
 * never stamped anything. `maxWidthPt` is optional on the wire: a commit path
 * that loses it still produces a perfectly valid page — one enormous line
 * running clean off the right edge of the paper. Only reading the LINES BACK
 * OUT of the stamped page can see that.
 *
 * The renderer's two wrap-width numbers are restated here because core cannot
 * import src (zone rule), with a drift guard against the real source below —
 * the same arrangement font-metrics.test.ts uses for LINE_SPACING.
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import type { PdfRect } from '@shared/types';
import { readFileSync } from 'node:fs';
import { makeTestPdf } from '../ops/test-fixtures';
import { addTextBox, layoutLines } from './text-box';
import { textMarksOnPage } from './stamp-testkit';

const PAGE = { width: 612, height: 792 };
const SIZE = 12;

/** Restated from src/features/text/text-geometry.ts. Guarded at the bottom. */
const BOX_INSET_PT = 2;

/** The owner's repro: a box an inch and a quarter wide, and a lot of text. */
const SMALL_BOX: PdfRect = { x: 72, y: 600, width: 90, height: 30 };
const LOTS_OF_TEXT =
  'The deposition of the witness was taken pursuant to notice under Code of Civil ' +
  'Procedure section 2025.010 and counsel stipulated on the record.';

type Matrix = [number, number, number, number, number, number];

/** pdfjs `PageViewport.transform` for an upright page, and for /Rotate 90. */
const upright = (scale: number): Matrix => [scale, 0, 0, -scale, 0, PAGE.height * scale];
const quarterTurned = (scale: number): Matrix => [0, scale, scale, 0, 0, 0];

function place(transform: Matrix, point: { x: number; y: number }) {
  const [a, b, c, d, e, f] = transform;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/** The viewer's `toLocalBox` — how wide the drawn box is ON SCREEN, in pixels. */
function screenWidth(transform: Matrix, rect: PdfRect): number {
  const first = place(transform, { x: rect.x, y: rect.y });
  const second = place(transform, { x: rect.x + rect.width, y: rect.y + rect.height });
  return Math.abs(second.x - first.x);
}

/** The renderer's `wrapWidthPt`, restated. This is what the preview wraps at. */
function wrapWidthPt(boxWidthPx: number, scale: number): number {
  return Math.max(1, boxWidthPx / scale - 2 * BOX_INSET_PT);
}

async function timesFont(): Promise<PDFFont> {
  const document = await PDFDocument.create({ updateMetadata: false });
  return document.embedFont(StandardFonts.TimesRoman);
}

/** The lines the FILE carries, read back out of the page's own operators. */
async function stampedLines(
  rect: PdfRect,
  transform: Matrix,
  scale: number,
  text: string,
  rotation?: number
): Promise<string[]> {
  const pages = [{ label: 'PAGE-1', ...PAGE, ...(rotation === undefined ? {} : { rotation }) }];
  const bytes = await makeTestPdf({ pages });
  const result = await addTextBox(bytes, {
    page: 1,
    at: { x: rect.x, y: rect.y + rect.height },
    text,
    fontSize: SIZE,
    color: '#000000',
    font: { family: 'times' },
    maxWidthPt: wrapWidthPt(screenWidth(transform, rect), scale),
  });
  return (await textMarksOnPage(result.bytes, 1))
    .map((mark) => mark.text)
    .filter((line) => line !== 'PAGE-1');
}

/** The lines the TYPING SURFACE shows at that same width. */
async function previewLines(
  rect: PdfRect,
  transform: Matrix,
  scale: number,
  text: string
): Promise<string[]> {
  const width = wrapWidthPt(screenWidth(transform, rect), scale);
  return layoutLines(text, await timesFont(), SIZE, width);
}

describe('a small box, typed full of text', () => {
  it('stamps the SAME wrap points the preview showed', async () => {
    const transform = upright(1.32);
    expect(await stampedLines(SMALL_BOX, transform, 1.32, LOTS_OF_TEXT)).toEqual(
      await previewLines(SMALL_BOX, transform, 1.32, LOTS_OF_TEXT)
    );
  });

  /**
   * The regression itself: a lost `maxWidthPt` collapses the stamp to one line
   * and nothing else about the document looks wrong. Only a line COUNT sees it.
   */
  it('never collapses to one long line running off the page', async () => {
    const stamped = await stampedLines(SMALL_BOX, upright(1.32), 1.32, LOTS_OF_TEXT);
    expect(stamped.length).toBeGreaterThan(1);
    expect(stamped.join(' ')).toBe(LOTS_OF_TEXT);
    const font = await timesFont();
    for (const line of stamped) {
      expect(font.widthOfTextAtSize(line, SIZE)).toBeLessThanOrEqual(SMALL_BOX.width);
    }
  });

  it('wraps identically at 50%, 100%, and 400%', async () => {
    const [half, full, quadruple] = await Promise.all(
      [0.5, 1, 4].map((scale) => stampedLines(SMALL_BOX, upright(scale), scale, LOTS_OF_TEXT))
    );
    expect(full).toEqual(half);
    expect(quadruple).toEqual(half);
  });

  it('wraps to the box as DISPLAYED on a quarter-turned page', async () => {
    const transform = quarterTurned(2);
    const stamped = await stampedLines(SMALL_BOX, transform, 2, LOTS_OF_TEXT, 90);
    expect(stamped).toEqual(await previewLines(SMALL_BOX, transform, 2, LOTS_OF_TEXT));
    expect(stamped.length).toBeGreaterThan(1);
  });

  it('keeps wrapping when the text grows far past the bottom of the box', async () => {
    // The preview grows DOWNWARD out of the drawn box: the box sets the width
    // and the start, never a ceiling, so ten times the text wraps the same way.
    const long = Array.from({ length: 10 }, () => LOTS_OF_TEXT).join(' ');
    const stamped = await stampedLines(SMALL_BOX, upright(1), 1, long);
    expect(stamped).toEqual(await previewLines(SMALL_BOX, upright(1), 1, long));
    expect(stamped.length).toBeGreaterThan(20);
  });

  it('underlines every wrapped line, not the box', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: 'PAGE-1', ...PAGE }] });
    const result = await addTextBox(bytes, {
      page: 1,
      at: { x: 72, y: 630 },
      text: LOTS_OF_TEXT,
      fontSize: SIZE,
      color: '#000000',
      font: { family: 'times' },
      maxWidthPt: 86,
      underline: true,
    });
    const lines = (await textMarksOnPage(result.bytes, 1))
      .map((mark) => mark.text)
      .filter((line) => line !== 'PAGE-1');
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('the restated renderer geometry', () => {
  it('still matches src/features/text/text-geometry.ts', () => {
    const geometrySource = readFileSync(
      new URL('../../src/features/text/text-geometry.ts', import.meta.url),
      'utf8'
    );
    expect(geometrySource).toContain(`export const BOX_INSET_PT = ${BOX_INSET_PT};`);
    expect(geometrySource).toContain('return box.width / scale - 2 * BOX_INSET_PT;');
    expect(geometrySource).toContain('return Math.max(1, insetWidthPt(box, scale));');
    expect(geometrySource).toContain('maxWidthPt: request.wrapWidthPt,');
  });
});

import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import type { TextBoxOptions } from '@shared/types';
import { containsText, makeTestPdf } from '../ops/test-fixtures';
import { frameOf, toUserSpace } from './geometry';
import { DEFAULT_UNDERLINE_OFFSET, DEFAULT_UNDERLINE_THICKNESS, standardFontFor } from './ink';
import { addTextBox, layoutLines } from './text-box';
import { angleOf, marksOnPage, place, textMarksOnPage } from './stamp-testkit';

const PAGE = { width: 612, height: 792 };

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    ...PAGE,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

function options(overrides: Partial<TextBoxOptions> = {}): TextBoxOptions {
  return {
    page: 1,
    at: { x: 120, y: 400 },
    text: 'Objection sustained.',
    fontSize: 12,
    color: '#000000',
    ...overrides,
  };
}

async function standardFont(name: StandardFonts): Promise<PDFFont> {
  const document = await PDFDocument.create({ updateMetadata: false });
  return document.embedFont(name);
}

async function helvetica(): Promise<PDFFont> {
  return standardFont(StandardFonts.Helvetica);
}

describe('layoutLines', () => {
  it('keeps hard line breaks as written', async () => {
    const font = await helvetica();
    expect(layoutLines('one\ntwo\r\nthree', font, 12)).toEqual(['one', 'two', 'three']);
  });

  it('wraps on spaces at the requested width', async () => {
    const font = await helvetica();
    const lines = layoutLines('the quick brown fox jumps over the lazy dog', font, 12, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(100);
    }
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('never drops a word too long to fit', async () => {
    const font = await helvetica();
    expect(layoutLines('supercalifragilistic', font, 12, 10)).toEqual(['supercalifragilistic']);
  });
});

describe('standardFontFor', () => {
  it('falls back to Times, the default a court filing expects', () => {
    expect(standardFontFor()).toBe(StandardFonts.TimesRoman);
    expect(standardFontFor({ family: 'helvetica' })).toBe(StandardFonts.Helvetica);
  });

  it('maps each family and its weight and slant onto a built-in face', () => {
    expect(standardFontFor({ family: 'times' })).toBe(StandardFonts.TimesRoman);
    expect(standardFontFor({ family: 'times', bold: true })).toBe(StandardFonts.TimesRomanBold);
    expect(standardFontFor({ family: 'times', italic: true })).toBe(StandardFonts.TimesRomanItalic);
    expect(standardFontFor({ family: 'courier', bold: true, italic: true })).toBe(
      StandardFonts.CourierBoldOblique
    );
    expect(standardFontFor({ family: 'helvetica', italic: true })).toBe(
      StandardFonts.HelveticaOblique
    );
  });
});

describe('addTextBox', () => {
  it('puts extractable text at the point that was clicked', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const result = await addTextBox(bytes, options());

    expect(result.pagesOut).toBe(2);
    expect(containsText(result.bytes, 'Objection sustained.')).toBe(true);
    const mark = (await textMarksOnPage(result.bytes, 1)).find(
      (m) => m.text === 'Objection sustained.'
    );
    const start = place(mark?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 });
    expect(start.x).toBeCloseTo(120, 6);
    expect(start.y).toBeGreaterThan(400);
    expect(start.y).toBeLessThan(404);
  });

  it('stacks later lines downward from the click', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await addTextBox(bytes, options({ text: 'first\nsecond' }));
    const marks = await textMarksOnPage(result.bytes, 1);
    const first = marks.find((m) => m.text === 'first');
    const second = marks.find((m) => m.text === 'second');
    expect(first?.matrix[5] ?? 0).toBeGreaterThan(second?.matrix[5] ?? 0);
  });

  it('writes upright on a rotated page', async () => {
    for (const rotation of [90, 180, 270]) {
      const frame = frameOf(PAGE, rotation);
      const bytes = await makeTestPdf({ pages: pages(1, rotation) });
      const at = toUserSpace(frame, { x: 40, y: 50 });
      const result = await addTextBox(bytes, options({ at }));
      const mark = (await textMarksOnPage(result.bytes, 1)).find(
        (m) => m.text === 'Objection sustained.'
      );
      expect(angleOf(mark?.matrix ?? [1, 0, 0, 1, 0, 0])).toBe(rotation);
    }
  });

  it('lays the text out in the chosen font rather than the default', async () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const wide = layoutLines(text, await standardFont(StandardFonts.Courier), 12, 100).length;
    const narrow = layoutLines(text, await helvetica(), 12, 100).length;
    // The check below only means something if the two faces disagree at all.
    expect(wide).toBeGreaterThan(narrow);

    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await addTextBox(
      bytes,
      options({ text, maxWidthPt: 100, font: { family: 'courier' } })
    );
    const drawn = (await textMarksOnPage(result.bytes, 1)).filter((m) => m.text !== 'PAGE-1');
    expect(drawn).toHaveLength(wide);
  });

  describe('underline', () => {
    const RULED = 'the quick brown fox jumps over the lazy dog';

    async function ruled(overrides: Partial<TextBoxOptions> = {}) {
      const bytes = await makeTestPdf({ pages: pages(1) });
      const result = await addTextBox(
        bytes,
        options({ text: RULED, maxWidthPt: 100, underline: true, ...overrides })
      );
      const marks = await marksOnPage(result.bytes, 1);
      return {
        lines: marks.filter((mark) => mark.kind === 'text' && mark.text !== 'PAGE-1'),
        rules: marks.filter((mark) => mark.kind === 'rect'),
      };
    }

    it('draws one rule per WRAPPED line, not one across the box', async () => {
      const { lines, rules } = await ruled();
      expect(lines.length).toBeGreaterThan(1);
      expect(rules).toHaveLength(lines.length);
    });

    it('draws no rule at all when it was not asked for', async () => {
      const { rules } = await ruled({ underline: false });
      expect(rules).toHaveLength(0);
    });

    it('sizes each rule to its own line and sits it just below the baseline', async () => {
      // No `font` in the options, so this is the Times default the box now uses.
      const font = await standardFont(StandardFonts.TimesRoman);
      const { lines, rules } = await ruled();
      const size = 12;
      for (const [index, rule] of rules.entries()) {
        const line = lines[index];
        const baseline = place(line?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 });
        const origin = place(rule.matrix, { x: 0, y: 0 });
        expect(rule.width).toBeCloseTo(font.widthOfTextAtSize(line?.text ?? '', size), 4);
        expect(rule.height).toBeCloseTo(size * DEFAULT_UNDERLINE_THICKNESS, 6);
        expect(origin.x).toBeCloseTo(baseline.x, 4);
        expect(baseline.y - origin.y).toBeCloseTo(
          size * (DEFAULT_UNDERLINE_OFFSET + DEFAULT_UNDERLINE_THICKNESS),
          6
        );
      }
    });

    it('scales the rule with the text size', async () => {
      const { rules } = await ruled({ fontSize: 24, maxWidthPt: 200 });
      for (const rule of rules)
        expect(rule.height).toBeCloseTo(24 * DEFAULT_UNDERLINE_THICKNESS, 6);
    });
  });

  it('honours the requested colour', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await addTextBox(bytes, options({ color: '#7C3AED' }));
    expect(containsText(result.bytes, 'Objection sustained.')).toBe(true);
    await expect(addTextBox(bytes, options({ color: 'purple' }))).rejects.toThrow(/#RRGGBB/);
  });

  describe('refusals', () => {
    it('refuses empty text and an impossible page', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(addTextBox(bytes, options({ text: '   ' }))).rejects.toThrow(/no text to add/);
      await expect(addTextBox(bytes, options({ page: 9 }))).rejects.toThrow(/pages 1 through 1/);
    });

    it('refuses a character the built-in fonts cannot print', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(addTextBox(bytes, options({ text: 'signed ☺' }))).rejects.toThrow(
        /cannot print/
      );
    });
  });
});

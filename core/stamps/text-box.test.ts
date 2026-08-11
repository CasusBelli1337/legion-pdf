import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import type { TextBoxOptions } from '@shared/types';
import { containsText, makeTestPdf } from '../ops/test-fixtures';
import { frameOf, toUserSpace } from './geometry';
import { addTextBox, layoutLines } from './text-box';
import { angleOf, place, textMarksOnPage } from './stamp-testkit';

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

async function helvetica(): Promise<PDFFont> {
  const document = await PDFDocument.create({ updateMetadata: false });
  return document.embedFont(StandardFonts.Helvetica);
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

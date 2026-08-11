import { describe, expect, it } from 'vitest';
import { RangeCollapseError } from '@shared/types';
import type { PageNumberOptions } from '@shared/types';
import { containsText, makeTestPdf } from '../ops/test-fixtures';
import { frameOf, toVisualSpace } from './geometry';
import { applyPageNumbers, pageNumberLabel } from './page-numbers';
import { angleOf, place, textMarksOnPage } from './stamp-testkit';

const PAGE = { width: 612, height: 792 };

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    ...PAGE,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

function options(overrides: Partial<PageNumberOptions> = {}): PageNumberOptions {
  return {
    template: 'Page {n} of {total}',
    pages: [1],
    placement: 'footer',
    alignment: 'center',
    fontSize: 10,
    margin: 36,
    startNumber: 1,
    ...overrides,
  };
}

const everyPage = (count: number): number[] =>
  Array.from({ length: count }, (_unused, index) => index + 1);

describe('pageNumberLabel', () => {
  it('fills in both placeholders, however many times they appear', () => {
    expect(pageNumberLabel('Page {n} of {total}', 3, 12)).toBe('Page 3 of 12');
    expect(pageNumberLabel('{n}/{total}', 1, 1)).toBe('1/1');
    expect(pageNumberLabel('- {n} -', 7, 9)).toBe('- 7 -');
  });
});

describe('applyPageNumbers', () => {
  it('numbers a whole document from one', async () => {
    const bytes = await makeTestPdf({ pages: pages(12) });
    const result = await applyPageNumbers(bytes, options({ pages: everyPage(12) }));

    expect(result.pagesOut).toBe(12);
    expect(result.detail.numbersApplied[0]).toBe('Page 1 of 12');
    expect(result.detail.numbersApplied[11]).toBe('Page 12 of 12');
    expect((await textMarksOnPage(result.bytes, 5)).map((m) => m.text)).toContain('Page 5 of 12');
    expect(containsText(result.bytes, 'Page 12 of 12')).toBe(true);
  });

  it('counts a numbered excerpt by its own length, not the whole file', async () => {
    const bytes = await makeTestPdf({ pages: pages(20) });
    const result = await applyPageNumbers(bytes, options({ pages: [5, 6, 7] }));
    expect(result.detail.numbersApplied).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']);
    expect((await textMarksOnPage(result.bytes, 4)).map((m) => m.text)).toEqual(['PAGE-4']);
  });

  it('starts the count where the attorney says', async () => {
    const bytes = await makeTestPdf({ pages: pages(3) });
    const result = await applyPageNumbers(bytes, options({ pages: [1, 2, 3], startNumber: 10 }));
    expect(result.detail.numbersApplied).toEqual([
      'Page 10 of 12',
      'Page 11 of 12',
      'Page 12 of 12',
    ]);
  });

  it('puts the footer at the bottom and the header at the top', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const footer = await applyPageNumbers(bytes, options({ placement: 'footer' }));
    const header = await applyPageNumbers(bytes, options({ placement: 'header' }));
    const at = async (result: { bytes: Uint8Array }) => {
      const mark = (await textMarksOnPage(result.bytes, 1)).find((m) => m.text.startsWith('Page'));
      return place(mark?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 });
    };
    expect((await at(footer)).y).toBeLessThan(PAGE.height / 4);
    expect((await at(header)).y).toBeGreaterThan((PAGE.height * 3) / 4);
  });

  it('aligns left, centre, and right inside the margins', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const starts: number[] = [];
    for (const alignment of ['left', 'center', 'right'] as const) {
      const result = await applyPageNumbers(bytes, options({ alignment }));
      const mark = (await textMarksOnPage(result.bytes, 1)).find((m) => m.text.startsWith('Page'));
      starts.push(place(mark?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 }).x);
    }
    expect(starts[0]).toBeCloseTo(36, 6);
    expect(starts[1] ?? 0).toBeGreaterThan(starts[0] ?? 0);
    expect(starts[2] ?? 0).toBeGreaterThan(starts[1] ?? 0);
    expect(starts[2] ?? 0).toBeLessThan(PAGE.width - 36);
  });

  it('sits in the displayed footer of a rotated page, upright', async () => {
    for (const rotation of [90, 180, 270]) {
      const bytes = await makeTestPdf({ pages: pages(1, rotation) });
      const result = await applyPageNumbers(bytes, options());
      const mark = (await textMarksOnPage(result.bytes, 1)).find((m) => m.text.startsWith('Page'));
      const matrix = mark?.matrix ?? [1, 0, 0, 1, 0, 0];
      const frame = frameOf(PAGE, rotation);
      expect(angleOf(matrix)).toBe(rotation);
      expect(toVisualSpace(frame, place(matrix, { x: 0, y: 0 })).y).toBeLessThan(
        frame.visual.height / 4
      );
    }
  });

  describe('refusals', () => {
    it('throws RangeCollapseError on an empty page selection', async () => {
      const bytes = await makeTestPdf({ pages: pages(2) });
      await expect(applyPageNumbers(bytes, options({ pages: [] }))).rejects.toBeInstanceOf(
        RangeCollapseError
      );
    });

    it('refuses an empty pattern and a negative start', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(applyPageNumbers(bytes, options({ template: ' ' }))).rejects.toThrow(/pattern/);
      await expect(applyPageNumbers(bytes, options({ startNumber: -2 }))).rejects.toThrow(
        /whole number/
      );
    });
  });
});

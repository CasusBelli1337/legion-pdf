import { describe, expect, it } from 'vitest';
import { containsText, makeTestPdf, pageWidths } from '../ops/test-fixtures';
import { insertSlipSheet } from './slip-sheet';
import { textMarksOnPage } from './stamp-testkit';

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    width: 600 + index,
    height: 800,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

describe('insertSlipSheet', () => {
  it('adds exactly one page at the chosen index', async () => {
    const bytes = await makeTestPdf({ pages: pages(4) });
    const result = await insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 3 });

    expect(result.pagesIn).toBe(4);
    expect(result.pagesOut).toBe(5);
    expect(await pageWidths(result.bytes)).toEqual([600, 601, 602, 602, 603]);
  });

  it('carries the label on the new sheet and nowhere else', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const result = await insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 1 });

    expect(containsText(result.bytes, 'Exhibit A')).toBe(true);
    expect((await textMarksOnPage(result.bytes, 1)).map((m) => m.text)).toEqual(['Exhibit A']);
    expect((await textMarksOnPage(result.bytes, 2)).map((m) => m.text)).toEqual(['PAGE-1']);
  });

  it('appends at the end when the position is one past the last page', async () => {
    const bytes = await makeTestPdf({ pages: pages(3) });
    const result = await insertSlipSheet(bytes, { label: 'Exhibit B', atPage: 4 });

    expect(result.pagesOut).toBe(4);
    expect((await textMarksOnPage(result.bytes, 4)).map((m) => m.text)).toEqual(['Exhibit B']);
  });

  it('matches the shape of a landscape neighbour rather than its stored size', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: 'WIDE', width: 612, height: 792 }] });
    const rotated = await makeTestPdf({
      pages: [{ label: 'WIDE', width: 612, height: 792, rotation: 90 }],
    });
    expect(
      await pageWidths((await insertSlipSheet(bytes, { label: 'A', atPage: 1 })).bytes)
    ).toEqual([612, 612]);
    expect(
      await pageWidths((await insertSlipSheet(rotated, { label: 'A', atPage: 1 })).bytes)
    ).toEqual([792, 612]);
  });

  it('shrinks a long label so it stays on the paper', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const long = 'EXHIBIT AA - DEPOSITION OF ARTHUR ROTHROCK';
    const result = await insertSlipSheet(bytes, { label: long, atPage: 1 });
    const mark = (await textMarksOnPage(result.bytes, 1)).at(0);
    expect(mark?.text).toBe(long);
    expect(mark?.matrix[4] ?? -1).toBeGreaterThanOrEqual(0);
  });

  describe('refusals', () => {
    it('refuses a position outside the document', async () => {
      const bytes = await makeTestPdf({ pages: pages(2) });
      await expect(insertSlipSheet(bytes, { label: 'A', atPage: 0 })).rejects.toThrow(
        /position 1 through 3/
      );
      await expect(insertSlipSheet(bytes, { label: 'A', atPage: 4 })).rejects.toThrow(
        /position 1 through 3/
      );
    });

    it('refuses an empty label', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(insertSlipSheet(bytes, { label: '', atPage: 1 })).rejects.toThrow(
        /needs a label/
      );
    });
  });
});

import { describe, expect, it } from 'vitest';
import { containsText, makeTestPdf, pageWidths } from '../ops/test-fixtures';
import { insertSlipSheet } from './slip-sheet';
import { marksOnPage, pageContent, place, textMarksOnPage } from './stamp-testkit';

/** Where the label's baseline landed on the new sheet, in the sheet's own space. */
async function labelAt(bytes: Uint8Array, page = 1) {
  const mark = (await textMarksOnPage(bytes, page)).at(0);
  if (mark === undefined) throw new Error('The sheet carries no label.');
  return place(mark.matrix, { x: 0, y: 0 });
}

async function rectsOn(bytes: Uint8Array, page: number) {
  return (await marksOnPage(bytes, page)).filter((mark) => mark.kind === 'rect');
}

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

  /**
   * The owner's report: the slip sheet ignored the size, border, and placement
   * he had set, so a divider page never matched the stamps around it.
   */
  describe('honouring the settings', () => {
    it('draws the label at the size asked for', async () => {
      const bytes = await makeTestPdf({ pages: [{ label: 'P', width: 612, height: 792 }] });
      const sizeOn = async (fontSize?: number) => {
        const options = fontSize === undefined ? {} : { fontSize };
        const sheet = await insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 1, ...options });
        // The size rides on the Tf operator, not on the text matrix.
        return /(\d+(?:\.\d+)?) Tf/.exec(await pageContent(sheet.bytes, 1))?.[1];
      };

      expect(await sizeOn(12)).toBe('12');
      expect(await sizeOn(60)).toBe('60');
      expect(await sizeOn()).toBe('36');
    });

    it('draws the classic bordered box when asked, and nothing when not', async () => {
      const bytes = await makeTestPdf({ pages: [{ label: 'P', width: 612, height: 792 }] });
      const plain = await insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 1 });
      const boxed = await insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 1, bordered: true });
      expect(await rectsOn(plain.bytes, 1)).toHaveLength(0);
      const box = (await rectsOn(boxed.bytes, 1)).at(-1);
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeCloseTo(0.718 * 36 + 16, 4);
    });

    it('centres the label by default, exactly as every sheet did before', async () => {
      const bytes = await makeTestPdf({ pages: [{ label: 'P', width: 612, height: 792 }] });
      const defaulted = await insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 1 });
      const asked = await insertSlipSheet(bytes, {
        label: 'Exhibit A',
        atPage: 1,
        position: 'center',
      });
      const at = await labelAt(defaulted.bytes);
      expect(at).toEqual(await labelAt(asked.bytes));
      expect(at.x).toBeGreaterThan(150);
      expect(at.y).toBeGreaterThan(300);
      expect(at.y).toBeLessThan(450);
    });

    it('parks the label in the corner it was given instead', async () => {
      const bytes = await makeTestPdf({ pages: [{ label: 'P', width: 612, height: 792 }] });
      const sheet = (position: 'top-left' | 'bottom-right' | 'bottom-center') =>
        insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 1, position });

      const topLeft = await labelAt((await sheet('top-left')).bytes);
      const bottomRight = await labelAt((await sheet('bottom-right')).bytes);
      const bottomCentre = await labelAt((await sheet('bottom-center')).bytes);

      expect(topLeft.x).toBeCloseTo(54, 6);
      expect(topLeft.y).toBeGreaterThan(700);
      expect(bottomRight.y).toBeCloseTo(54, 6);
      expect(bottomRight.x).toBeGreaterThan(topLeft.x);
      expect(bottomCentre.y).toBeCloseTo(bottomRight.y, 6);
      expect(bottomCentre.x).toBeGreaterThan(topLeft.x);
      expect(bottomCentre.x).toBeLessThan(bottomRight.x);
    });

    it('still shrinks an oversized label, border padding counted in', async () => {
      const bytes = await makeTestPdf({ pages: [{ label: 'P', width: 612, height: 792 }] });
      const long = 'EXHIBIT AA - DEPOSITION OF ARTHUR ROTHROCK';
      const result = await insertSlipSheet(bytes, {
        label: long,
        atPage: 1,
        fontSize: 72,
        bordered: true,
      });
      const box = (await rectsOn(result.bytes, 1)).at(-1);
      const at = await labelAt(result.bytes);
      expect(box?.width).toBeLessThanOrEqual(612 - 2 * 54);
      expect(at.x).toBeGreaterThan(0);
    });
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

    it('refuses a text size of zero rather than drawing nothing', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(
        insertSlipSheet(bytes, { label: 'Exhibit A', atPage: 1, fontSize: 0 })
      ).rejects.toThrow(/size must be above zero/);
    });
  });
});

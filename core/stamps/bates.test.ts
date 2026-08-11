import { describe, expect, it } from 'vitest';
import { RangeCollapseError } from '@shared/types';
import type { BatesOptions, Corner } from '@shared/types';
import { containsText, makeTestPdf } from '../ops/test-fixtures';
import { applyBates, batesLabel } from './bates';
import { angleOf, marksOnPage, place, textMarksOnPage } from './stamp-testkit';

const PAGE = { width: 612, height: 792 };

function options(overrides: Partial<BatesOptions> = {}): BatesOptions {
  return {
    prefix: 'ASHFORD',
    startNumber: 123,
    padWidth: 6,
    pages: [1],
    position: 'bottom-right',
    fontSize: 10,
    margin: 36,
    whiteBackingBox: false,
    ...overrides,
  };
}

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    width: PAGE.width,
    height: PAGE.height,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

const everyPage = (count: number): number[] =>
  Array.from({ length: count }, (_unused, index) => index + 1);

describe('batesLabel', () => {
  it('pads to the requested width and counts up from the start number', () => {
    const spec = options();
    expect(batesLabel(spec, 0)).toBe('ASHFORD000123');
    expect(batesLabel(spec, 1)).toBe('ASHFORD000124');
    expect(batesLabel({ ...spec, padWidth: 0 }, 0)).toBe('ASHFORD123');
    expect(batesLabel({ ...spec, prefix: '' }, 0)).toBe('000123');
  });

  it('lets a number wider than the padding through rather than truncating it', () => {
    expect(batesLabel(options({ startNumber: 1234567, padWidth: 3 }), 0)).toBe('ASHFORD1234567');
  });
});

describe('applyBates', () => {
  it('stamps the exact expected string on every page of a 20-page range', async () => {
    const bytes = await makeTestPdf({ pages: pages(20) });
    const result = await applyBates(bytes, options({ pages: everyPage(20) }));

    expect(result.pagesIn).toBe(20);
    expect(result.pagesOut).toBe(20);
    expect(result.detail.batesApplied).toHaveLength(20);
    expect(result.detail.batesApplied[0]).toBe('ASHFORD000123');
    expect(result.detail.batesApplied[19]).toBe('ASHFORD000142');

    for (const [index, label] of result.detail.batesApplied.entries()) {
      const marks = await textMarksOnPage(result.bytes, index + 1);
      expect(marks.map((mark) => mark.text)).toContain(label);
    }
  });

  it('numbers only the pages in the range and leaves the rest untouched', async () => {
    const bytes = await makeTestPdf({ pages: pages(6) });
    const result = await applyBates(bytes, options({ pages: [2, 3, 5], startNumber: 1 }));

    expect(result.detail.batesApplied).toEqual(['ASHFORD000001', 'ASHFORD000002', 'ASHFORD000003']);
    const stamped = await textMarksOnPage(result.bytes, 3);
    expect(stamped.map((mark) => mark.text)).toContain('ASHFORD000002');
    const untouched = await textMarksOnPage(result.bytes, 4);
    expect(untouched.map((mark) => mark.text)).toEqual(['PAGE-4']);
  });

  it('continues a run across a document that was already numbered', async () => {
    const bytes = await makeTestPdf({ pages: pages(4) });
    const first = await applyBates(bytes, options({ pages: [1, 2], startNumber: 1 }));
    const second = await applyBates(first.bytes, options({ pages: [3, 4], startNumber: 3 }));

    expect(second.detail.batesApplied).toEqual(['ASHFORD000003', 'ASHFORD000004']);
    expect(containsText(second.bytes, 'ASHFORD000001')).toBe(true);
    expect(containsText(second.bytes, 'ASHFORD000004')).toBe(true);
  });

  it('places the number inside the margin at each of the four corners', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const corners: Corner[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
    for (const position of corners) {
      const result = await applyBates(bytes, options({ position }));
      const mark = (await textMarksOnPage(result.bytes, 1)).find(
        (found) => found.text === 'ASHFORD000123'
      );
      const at = { x: mark?.matrix[4] ?? 0, y: mark?.matrix[5] ?? 0 };
      const atLeft = position.endsWith('left');
      const atTop = position.startsWith('top');
      expect(at.x > 36 === !atLeft).toBe(true);
      expect(at.x < PAGE.width / 2 === atLeft).toBe(true);
      expect(at.y > PAGE.height / 2 === atTop).toBe(true);
    }
  });

  it('draws a white backing box behind the number when asked', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const plain = await applyBates(bytes, options());
    const boxed = await applyBates(bytes, options({ whiteBackingBox: true }));

    const rectsBefore = (await marksOnPage(plain.bytes, 1)).filter((m) => m.kind === 'rect');
    const rectsAfter = (await marksOnPage(boxed.bytes, 1)).filter((m) => m.kind === 'rect');
    expect(rectsAfter.length).toBe(rectsBefore.length + 1);
    const box = rectsAfter.at(-1);
    expect(box?.width).toBeGreaterThan(40);
    expect(box?.height).toBeGreaterThan(10);
  });

  it('adds no annotation — the number is page content, not a sticker', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const result = await applyBates(bytes, options({ pages: [1, 2] }));
    const marks = await marksOnPage(result.bytes, 1);
    expect(marks.some((mark) => mark.kind === 'text' && mark.text === 'ASHFORD000123')).toBe(true);
  });

  describe('rotated pages', () => {
    for (const rotation of [90, 180, 270]) {
      it(`turns the number upright on a ${rotation}-degree page`, async () => {
        const bytes = await makeTestPdf({ pages: pages(1, rotation) });
        const result = await applyBates(bytes, options({ position: 'bottom-right' }));
        const mark = (await textMarksOnPage(result.bytes, 1)).find(
          (found) => found.text === 'ASHFORD000123'
        );
        expect(mark).toBeDefined();
        expect(angleOf(mark?.matrix ?? [1, 0, 0, 1, 0, 0])).toBe(rotation);
      });

      it(`lands the number inside the paper on a ${rotation}-degree page`, async () => {
        const bytes = await makeTestPdf({ pages: pages(1, rotation) });
        const result = await applyBates(bytes, options({ position: 'bottom-right' }));
        const mark = (await textMarksOnPage(result.bytes, 1)).find(
          (found) => found.text === 'ASHFORD000123'
        );
        const start = place(mark?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 });
        expect(start.x).toBeGreaterThanOrEqual(0);
        expect(start.x).toBeLessThanOrEqual(PAGE.width);
        expect(start.y).toBeGreaterThanOrEqual(0);
        expect(start.y).toBeLessThanOrEqual(PAGE.height);
      });
    }

    it('puts the visual bottom-right of a 90-degree page at the stored top-right', async () => {
      const bytes = await makeTestPdf({ pages: pages(1, 90) });
      const result = await applyBates(bytes, options({ position: 'bottom-right' }));
      const mark = (await textMarksOnPage(result.bytes, 1)).find(
        (found) => found.text === 'ASHFORD000123'
      );
      const start = place(mark?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 });
      expect(start.x).toBeGreaterThan(PAGE.width - 60);
      expect(start.y).toBeGreaterThan(PAGE.height - 200);
    });
  });

  describe('refusals', () => {
    it('throws RangeCollapseError when the range selects nothing', async () => {
      const bytes = await makeTestPdf({ pages: pages(3) });
      await expect(applyBates(bytes, options({ pages: [] }))).rejects.toBeInstanceOf(
        RangeCollapseError
      );
    });

    it('refuses a page the document does not have', async () => {
      const bytes = await makeTestPdf({ pages: pages(3) });
      await expect(applyBates(bytes, options({ pages: [9] }))).rejects.toThrow(/pages 1 through 3/);
    });

    it('refuses nonsense options in plain English', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(applyBates(bytes, options({ startNumber: -1 }))).rejects.toThrow(/whole number/);
      await expect(applyBates(bytes, options({ padWidth: 99 }))).rejects.toThrow(/at most/);
      await expect(applyBates(bytes, options({ fontSize: 0 }))).rejects.toThrow(/above zero/);
    });
  });
});

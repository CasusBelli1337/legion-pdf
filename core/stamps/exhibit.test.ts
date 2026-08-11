import { describe, expect, it } from 'vitest';
import { RangeCollapseError } from '@shared/types';
import type { ExhibitOptions, ExhibitPosition } from '@shared/types';
import { annotationCounts, containsText, makeTestPdf } from '../ops/test-fixtures';
import { applyExhibitStamp } from './exhibit';
import { angleOf, marksOnPage, place, textMarksOnPage } from './stamp-testkit';

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    width: 612,
    height: 792,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

function options(overrides: Partial<ExhibitOptions> = {}): ExhibitOptions {
  return {
    label: 'EXHIBIT A',
    pages: [1],
    position: 'top-right',
    fontSize: 14,
    margin: 24,
    bordered: true,
    ...overrides,
  };
}

describe('applyExhibitStamp', () => {
  it('puts an extractable label on the stamped page and nowhere else', async () => {
    const bytes = await makeTestPdf({ pages: pages(3) });
    const result = await applyExhibitStamp(bytes, options());

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(3);
    expect(result.detail.labelsApplied).toEqual(['EXHIBIT A']);
    expect(containsText(result.bytes, 'EXHIBIT A')).toBe(true);
    expect((await textMarksOnPage(result.bytes, 1)).map((mark) => mark.text)).toContain(
      'EXHIBIT A'
    );
    expect((await textMarksOnPage(result.bytes, 2)).map((mark) => mark.text)).toEqual(['PAGE-2']);
  });

  it('draws the classic bordered box around the label', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const bordered = await applyExhibitStamp(bytes, options({ bordered: true }));
    const plain = await applyExhibitStamp(bytes, options({ bordered: false }));

    const borderedRects = (await marksOnPage(bordered.bytes, 1)).filter((m) => m.kind === 'rect');
    const plainRects = (await marksOnPage(plain.bytes, 1)).filter((m) => m.kind === 'rect');
    expect(borderedRects.length).toBe(plainRects.length + 1);
    const box = borderedRects.at(-1);
    expect(box?.width).toBeGreaterThan(60);
    expect(box?.height).toBeGreaterThan(20);
  });

  it('adds no annotation object — the stamp cannot be deleted in another reader', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const result = await applyExhibitStamp(bytes, options({ pages: [1, 2] }));
    expect(await annotationCounts(result.bytes)).toEqual([0, 0]);
  });

  it('stamps a run of labels across a document', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const first = await applyExhibitStamp(bytes, options({ label: 'EXHIBIT Z' }));
    const second = await applyExhibitStamp(
      first.bytes,
      options({ label: 'EXHIBIT AA', pages: [2] })
    );
    expect(containsText(second.bytes, 'EXHIBIT Z')).toBe(true);
    expect(containsText(second.bytes, 'EXHIBIT AA')).toBe(true);
  });

  it('centres a bottom-center label between the bottom corners, same margin', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const labelAt = async (position: ExhibitPosition) => {
      const result = await applyExhibitStamp(bytes, options({ position }));
      const mark = (await textMarksOnPage(result.bytes, 1)).find((m) => m.text === 'EXHIBIT A');
      return place(mark?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 });
    };

    const left = await labelAt('bottom-left');
    const right = await labelAt('bottom-right');
    const centre = await labelAt('bottom-center');
    expect(centre.x).toBeCloseTo((left.x + right.x) / 2, 6);
    expect(centre.x).toBeGreaterThan(left.x);
    expect(centre.x).toBeLessThan(right.x);
    expect(centre.y).toBeCloseTo(left.y, 6);
  });

  it('turns the stamp upright on a rotated page', async () => {
    for (const rotation of [90, 180, 270]) {
      const bytes = await makeTestPdf({ pages: pages(1, rotation) });
      const result = await applyExhibitStamp(bytes, options());
      const mark = (await textMarksOnPage(result.bytes, 1)).find((m) => m.text === 'EXHIBIT A');
      expect(angleOf(mark?.matrix ?? [1, 0, 0, 1, 0, 0])).toBe(rotation);
    }
  });

  describe('refusals', () => {
    it('throws RangeCollapseError on an empty page selection', async () => {
      const bytes = await makeTestPdf({ pages: pages(2) });
      await expect(applyExhibitStamp(bytes, options({ pages: [] }))).rejects.toBeInstanceOf(
        RangeCollapseError
      );
    });

    it('refuses an empty label', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(applyExhibitStamp(bytes, options({ label: '  ' }))).rejects.toThrow(
        /needs a label/
      );
    });
  });
});

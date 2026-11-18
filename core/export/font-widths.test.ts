import { describe, expect, it } from 'vitest';
import { pageWidthScale } from './font-widths';
import { page, run } from './layout-testkit';

const TEXT = 'practice for collecting and processing correspondence';
/** The text's width on Times New Roman's own advances at 12 pt. */
const NATURAL = 258.252;

function lines(width: number, count = 8) {
  return Array.from({ length: count }, (_unused, index) =>
    run(TEXT, 72, 700 - 14 * index, { width })
  );
}

describe('pageWidthScale', () => {
  it('is 1 for a page set on Word’s own widths', () => {
    expect(pageWidthScale(page(lines(NATURAL)))).toBeCloseTo(1, 4);
  });

  it('measures a page set nearly one per cent narrower than Word will set it', () => {
    expect(pageWidthScale(page(lines(NATURAL / 1.009)))).toBeCloseTo(1.009, 4);
  });

  it('takes a justified page (stretched spaces) as equal, never narrower', () => {
    expect(pageWidthScale(page(lines(NATURAL * 1.01)))).toBe(1);
  });

  it('concludes nothing from another face, from too little text, or from a wild ratio', () => {
    const arial = lines(NATURAL).map((entry) => ({ ...entry, fontKey: 'arial' }));
    expect(pageWidthScale(page(arial))).toBeNull();
    expect(pageWidthScale(page(lines(NATURAL, 3)))).toBeNull();
    expect(pageWidthScale(page(lines(NATURAL * 0.9)))).toBeNull();
  });
});

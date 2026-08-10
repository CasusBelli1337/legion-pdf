import { describe, expect, it } from 'vitest';
import { findMatchesOnPage, type SearchTextItem } from './text-search';

/** A horizontal run of text starting at (x, y) in PDF points. */
function run(str: string, x: number, y: number, width: number): SearchTextItem {
  return { str, transform: [12, 0, 0, 12, x, y], width, height: 12 };
}

describe('findMatchesOnPage', () => {
  const items = [
    run('The witness produced ', 72, 700, 120),
    run('Exhibit A on 3 May.', 192, 700, 110),
  ];

  it('finds every hit and numbers them from the running document ordinal', () => {
    const result = findMatchesOnPage([run('cat hat cat', 72, 700, 66)], 'cat', 3, 7);
    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((match) => match.index)).toEqual([7, 8]);
    expect(result.nextIndex).toBe(9);
    expect(result.matches[0]?.page).toBe(3);
  });

  it('is case-insensitive and keeps the document casing in the result', () => {
    const result = findMatchesOnPage(items, 'exhibit a', 1, 0);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.text).toBe('Exhibit A');
  });

  it('matches across two text runs and returns one quad per run', () => {
    const result = findMatchesOnPage(items, 'produced Exhibit', 1, 0);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.quads).toHaveLength(2);
  });

  it('returns quads in PDF user space, positioned along the run', () => {
    const result = findMatchesOnPage([run('AAAABBBB', 100, 500, 80)], 'BBBB', 1, 0);
    const quad = result.matches[0]?.quads[0];
    expect(quad).toBeDefined();
    expect(quad?.x).toBeCloseTo(140, 6);
    expect(quad?.y).toBeCloseTo(500, 6);
    expect(quad?.width).toBeCloseTo(40, 6);
    expect(quad?.height).toBeCloseTo(12, 6);
  });

  it('offsets quads along the writing direction on rotated text', () => {
    const vertical: SearchTextItem = {
      str: 'AAAABBBB',
      transform: [0, 12, -12, 0, 300, 400],
      width: 80,
      height: 12,
    };
    const quad = findMatchesOnPage([vertical], 'BBBB', 1, 0).matches[0]?.quads[0];
    expect(quad?.x).toBeCloseTo(300, 6);
    expect(quad?.y).toBeCloseTo(440, 6);
  });

  it('never reports a zero-width quad, which would highlight nothing', () => {
    const quad = findMatchesOnPage([run('abc', 0, 0, 0)], 'b', 1, 0).matches[0]?.quads[0];
    expect(quad?.width).toBeGreaterThan(0);
    expect(quad?.height).toBeGreaterThan(0);
  });

  it('treats an empty or whitespace query as no search at all', () => {
    expect(findMatchesOnPage(items, '   ', 1, 4)).toEqual({ matches: [], nextIndex: 4 });
  });

  it('skips empty runs instead of letting them shift the character offsets', () => {
    const withGap = [
      run('Bates ', 72, 700, 36),
      run('', 100, 700, 0),
      run('ASHFORD000123', 108, 700, 72),
    ];
    const result = findMatchesOnPage(withGap, 'Bates ASHFORD000123', 2, 0);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.quads).toHaveLength(2);
  });
});

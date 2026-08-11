import { describe, expect, it } from 'vitest';
import { ALL_PAGES, describePageCount, everyPage, parsePageRange } from './page-range';

describe('parsePageRange', () => {
  it('treats an empty box and "all" as the whole document', () => {
    expect(parsePageRange('', 4)).toEqual({ pages: [1, 2, 3, 4], error: null });
    expect(parsePageRange('   ', 3)).toEqual({ pages: [1, 2, 3], error: null });
    expect(parsePageRange(ALL_PAGES, 2)).toEqual({ pages: [1, 2], error: null });
    expect(parsePageRange('ALL', 2)).toEqual({ pages: [1, 2], error: null });
  });

  it('expands ranges and single pages, sorted and de-duplicated', () => {
    expect(parsePageRange('3, 1-2, 3', 10).pages).toEqual([1, 2, 3]);
    expect(parsePageRange('8 - 10', 12).pages).toEqual([8, 9, 10]);
  });

  it('says what to type instead when the input is nonsense', () => {
    expect(parsePageRange('one', 5).error).toMatch(/not a page number/);
    expect(parsePageRange('0-2', 5).error).toMatch(/Pages start at 1/);
    expect(parsePageRange('9-3', 20).error).toMatch(/runs backwards/);
    expect(parsePageRange('1-99', 20).error).toMatch(/ends at page 20/);
  });

  it('reports no pages whenever it reports a problem', () => {
    expect(parsePageRange('1-99', 20).pages).toEqual([]);
  });
});

describe('everyPage', () => {
  it('counts from one', () => {
    expect(everyPage(3)).toEqual([1, 2, 3]);
    expect(everyPage(0)).toEqual([]);
  });
});

describe('describePageCount', () => {
  it('gets the plural right', () => {
    expect(describePageCount(1)).toBe('1 page');
    expect(describePageCount(20)).toBe('20 pages');
  });
});

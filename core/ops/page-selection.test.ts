import { describe, expect, it } from 'vitest';
import { RangeCollapseError } from '@shared/types';
import {
  assertPermutation,
  normalizePages,
  parsePageRanges,
  survivingPages,
  toZeroBased,
} from './page-selection';

describe('parsePageRanges', () => {
  it('parses a mixed spec into sorted, de-duplicated pages', () => {
    expect(parsePageRanges('3, 1-2, 2, 6-8', 10)).toEqual([1, 2, 3, 6, 7, 8]);
  });

  it('accepts a single page and whitespace around ranges', () => {
    expect(parsePageRanges('  7  ', 10)).toEqual([7]);
    expect(parsePageRanges('1 - 3', 10)).toEqual([1, 2, 3]);
  });

  it('throws RangeCollapseError when the spec selects nothing', () => {
    expect(() => parsePageRanges('   ', 12)).toThrow(RangeCollapseError);
    expect(() => parsePageRanges(',,', 12)).toThrow(RangeCollapseError);
  });

  it('refuses a range that runs past the end of the document, in plain English', () => {
    expect(() => parsePageRanges('1-40', 12)).toThrow(
      '"1-40" asks for page 40, but this document ends at page 12.'
    );
  });

  it('refuses a backwards range and says how to write it', () => {
    expect(() => parsePageRanges('9-4', 12)).toThrow(
      'Range "9-4" runs backwards — write it as 4-9.'
    );
  });

  it('refuses text that is not a page range', () => {
    expect(() => parsePageRanges('one to three', 12)).toThrow(/is not a page number or a range/);
  });
});

describe('normalizePages', () => {
  it('sorts and de-duplicates a thumbnail selection', () => {
    expect(normalizePages([5, 1, 5, 3], 8)).toEqual([1, 3, 5]);
  });

  it('throws RangeCollapseError on an empty selection', () => {
    expect(() => normalizePages([], 8)).toThrow(RangeCollapseError);
  });

  it('refuses a page the document does not have', () => {
    expect(() => normalizePages([9], 8, 'pages to delete')).toThrow(
      'The pages to delete includes page 9, but this document has pages 1 through 8.'
    );
    expect(() => normalizePages([0], 8)).toThrow(/page 0/);
    expect(() => normalizePages([1.5], 8)).toThrow(/page 1.5/);
  });
});

describe('assertPermutation', () => {
  it('accepts a complete permutation', () => {
    expect(assertPermutation([3, 1, 2], 3)).toEqual([3, 1, 2]);
  });

  it('refuses a short list, a duplicate, and a page that does not exist', () => {
    expect(() => assertPermutation([1, 2], 3)).toThrow(/lists 2 pages but the document has 3/);
    expect(() => assertPermutation([1, 1, 2], 3)).toThrow('The new page order lists page 1 twice.');
    expect(() => assertPermutation([1, 2, 9], 3)).toThrow(/page 9, which does not exist/);
  });
});

describe('survivingPages', () => {
  it('returns what is left after a delete', () => {
    expect(survivingPages([2, 4], 5)).toEqual([1, 3, 5]);
  });

  it('throws RangeCollapseError rather than empty a document', () => {
    expect(() => survivingPages([1, 2, 3], 3)).toThrow(RangeCollapseError);
  });
});

describe('toZeroBased', () => {
  it('converts the app-wide 1-based page numbers to pdf-lib indices', () => {
    expect(toZeroBased([1, 4, 9])).toEqual([0, 3, 8]);
  });
});

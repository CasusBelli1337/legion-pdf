import { describe, expect, it } from 'vitest';
import {
  extendSelection,
  gridScrollTop,
  initialSelection,
  isSameOrder,
  moveSelectionBefore,
  orderedSelection,
  rowOfPage,
  selectAllPages,
  toggleSelection,
} from './selection';

describe('toggleSelection', () => {
  it('replaces the selection on a plain click', () => {
    expect(toggleSelection(new Set([2, 3]), 5, false)).toEqual(new Set([5]));
  });

  it('clears the selection when the only selected page is clicked again', () => {
    expect(toggleSelection(new Set([5]), 5, false)).toEqual(new Set());
  });

  it('adds and removes with Ctrl-click', () => {
    expect(toggleSelection(new Set([2]), 5, true)).toEqual(new Set([2, 5]));
    expect(toggleSelection(new Set([2, 5]), 5, true)).toEqual(new Set([2]));
  });
});

describe('extendSelection', () => {
  it('adds everything between the anchor and the clicked page, either direction', () => {
    expect(extendSelection(new Set([2]), 2, 5)).toEqual(new Set([2, 3, 4, 5]));
    expect(extendSelection(new Set([5]), 5, 2)).toEqual(new Set([2, 3, 4, 5]));
  });
});

describe('selectAllPages and orderedSelection', () => {
  it('selects every page and hands them back in document order', () => {
    expect(orderedSelection(selectAllPages(4))).toEqual([1, 2, 3, 4]);
    expect(orderedSelection(new Set([9, 1, 4]))).toEqual([1, 4, 9]);
  });
});

describe('moveSelectionBefore', () => {
  it('moves one page forward', () => {
    expect(moveSelectionBefore(5, new Set([1]), 4)).toEqual([2, 3, 1, 4, 5]);
  });

  it('moves one page backward', () => {
    expect(moveSelectionBefore(5, new Set([4]), 2)).toEqual([1, 4, 2, 3, 5]);
  });

  it('keeps a multi-page selection together and in order', () => {
    expect(moveSelectionBefore(6, new Set([2, 4]), 6)).toEqual([1, 3, 5, 2, 4, 6]);
  });

  it('moves the selection to the end when dropped past the last page', () => {
    expect(moveSelectionBefore(4, new Set([1, 2]), 5)).toEqual([3, 4, 1, 2]);
  });

  it('always returns a complete permutation', () => {
    const order = moveSelectionBefore(7, new Set([3, 6]), 2);
    expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('isSameOrder', () => {
  it('spots a drag that changed nothing so the app can skip the round trip', () => {
    expect(isSameOrder([1, 2, 3])).toBe(true);
    expect(isSameOrder(moveSelectionBefore(3, new Set([1]), 2))).toBe(true);
    expect(isSameOrder([2, 1, 3])).toBe(false);
  });
});

describe('initialSelection', () => {
  it('opens the panel on the page the viewer is showing', () => {
    expect(initialSelection(250, 500)).toEqual(new Set([250]));
    expect(initialSelection(1, 1)).toEqual(new Set([1]));
  });

  it('selects nothing when that page is not in this document', () => {
    expect(initialSelection(9, 4)).toEqual(new Set());
    expect(initialSelection(0, 4)).toEqual(new Set());
    expect(initialSelection(1, 0)).toEqual(new Set());
  });
});

describe('rowOfPage', () => {
  it('finds the grid row a page sits in', () => {
    expect(rowOfPage(1, 2)).toBe(0);
    expect(rowOfPage(2, 2)).toBe(0);
    expect(rowOfPage(3, 2)).toBe(1);
    expect(rowOfPage(250, 2)).toBe(124);
  });

  it('never asks the grid to scroll above its first row', () => {
    expect(rowOfPage(0, 2)).toBe(0);
    expect(rowOfPage(-5, 2)).toBe(0);
  });
});

describe('gridScrollTop', () => {
  it('centres the row the page sits in', () => {
    // Row 124 (page 250, two per row) starts at 124 * 136 = 16864.
    expect(gridScrollTop(250, 2, 136, 680)).toBe(16864 - 272);
  });

  it('never scrolls above the top of the grid', () => {
    expect(gridScrollTop(1, 2, 136, 680)).toBe(0);
    expect(gridScrollTop(3, 2, 136, 680)).toBe(0);
  });

  it('copes with a grid too short to centre anything', () => {
    expect(gridScrollTop(250, 2, 136, 100)).toBe(16864);
  });
});

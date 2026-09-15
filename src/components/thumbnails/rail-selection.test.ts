import { describe, expect, it } from 'vitest';
import { dropBeforePage, pagesWithin, railSelect, selectionForMenu } from './rail-selection';

const set = (...pages: number[]): Set<number> => new Set(pages);
const plain = { additive: false, extend: false };
const ctrl = { additive: true, extend: false };
const shift = { additive: false, extend: true };

describe('railSelect', () => {
  it('replaces the selection on a plain click', () => {
    expect(railSelect(set(2, 3), 7, plain, 2)).toEqual(set(7));
  });

  it('keeps a page selected when it is clicked again, unlike the organize grid', () => {
    // Clicking a thumbnail also navigates to it; deselecting the page the
    // viewer just moved to would contradict the highlight on screen.
    expect(railSelect(set(4), 4, plain, 4)).toEqual(set(4));
  });

  it('adds a page with Ctrl/Cmd and removes it on a second Ctrl click', () => {
    expect(railSelect(set(1), 5, ctrl, 1)).toEqual(set(1, 5));
    expect(railSelect(set(1, 5), 5, ctrl, 1)).toEqual(set(1));
  });

  it('extends from the anchor with Shift, in either direction', () => {
    expect(railSelect(set(4), 7, shift, 4)).toEqual(set(4, 5, 6, 7));
    expect(railSelect(set(7), 4, shift, 7)).toEqual(set(4, 5, 6, 7));
  });

  it('treats Shift with no anchor as a plain click', () => {
    expect(railSelect(set(2, 3), 9, shift, null)).toEqual(set(9));
  });
});

describe('selectionForMenu', () => {
  it('leaves a multi-page selection alone when the click lands inside it', () => {
    expect(selectionForMenu(set(2, 3, 4), 3)).toEqual(set(2, 3, 4));
  });

  it('selects the page that was right-clicked outside the selection', () => {
    expect(selectionForMenu(set(2, 3, 4), 9)).toEqual(set(9));
  });

  it('selects a page when nothing was selected', () => {
    expect(selectionForMenu(set(), 1)).toEqual(set(1));
  });
});

describe('dropBeforePage', () => {
  it('inserts before the page when the pointer is in its top half', () => {
    expect(dropBeforePage(5, 10, 100)).toBe(5);
  });

  it('inserts after the page when the pointer is in its bottom half', () => {
    expect(dropBeforePage(5, 90, 100)).toBe(6);
  });

  it('treats the exact middle as the gap below', () => {
    expect(dropBeforePage(5, 50, 100)).toBe(6);
  });

  it('falls back to the page itself when the row has not been measured', () => {
    expect(dropBeforePage(5, 0, 0)).toBe(5);
  });
});

describe('pagesWithin', () => {
  it('drops page numbers the document no longer has', () => {
    expect(pagesWithin(set(1, 4, 9), 4)).toEqual(set(1, 4));
  });

  it('empties the selection when every page is gone', () => {
    expect(pagesWithin(set(3, 4), 0)).toEqual(set());
  });

  it('keeps a selection that still fits', () => {
    expect(pagesWithin(set(1, 2), 10)).toEqual(set(1, 2));
  });
});

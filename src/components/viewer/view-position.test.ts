import { describe, expect, it } from 'vitest';
import { positionAt, scrollTopFor, type PageRow } from './view-position';

/** Three Letter pages at 100%: 792pt tall plus the 24px gap, stacked. */
const ROWS: PageRow[] = [
  { index: 0, start: 0, size: 816 },
  { index: 1, start: 816, size: 816 },
  { index: 2, start: 1632, size: 816 },
];

describe('positionAt', () => {
  it('reports the page under the top edge and how far into it the reader is', () => {
    expect(positionAt(0, ROWS)).toEqual({ page: 1, offset: 0 });
    expect(positionAt(816 + 408, ROWS)).toEqual({ page: 2, offset: 0.5 });
  });

  it('tolerates the few pixels of gap above a page so a page top files as that page', () => {
    // 5px above page 3's start still means "page 3", not "the end of page 2".
    expect(positionAt(1632 - 5, ROWS)?.page).toBe(3);
  });

  it('answers null before anything is measured', () => {
    expect(positionAt(100, [])).toBeNull();
  });
});

describe('scrollTopFor', () => {
  it('lands the same spot back on the same page, whatever the rows now measure', () => {
    const position = positionAt(816 + 408, ROWS);
    if (position === null) throw new Error('no position');
    // The page grew (zoomed in): the spot is still halfway down it.
    expect(scrollTopFor(position, { index: 1, start: 1000, size: 1200 })).toBe(1600);
  });

  it('never scrolls above the top of the run', () => {
    expect(scrollTopFor({ page: 1, offset: -1 }, ROWS[0]!)).toBe(0);
  });
});

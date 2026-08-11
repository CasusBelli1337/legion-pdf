import { describe, expect, it } from 'vitest';
import type { BookmarkNode } from '@shared/types';
import {
  appendBookmark,
  bookmarkAt,
  defaultBookmarkTitle,
  removeBookmark,
  renameBookmark,
  samePath,
} from './bookmark-edits';

function node(title: string, page: number, children: BookmarkNode[] = []): BookmarkNode {
  return { title, page, children };
}

/** Two top-level headings; the first has two sub-headings under it. */
const TREE: BookmarkNode[] = [
  node('Motion', 1, [node('Argument', 4), node('Conclusion', 9)]),
  node('Exhibits', 12),
];

describe('adding a bookmark', () => {
  it('appends it to the end of the top level', () => {
    const next = appendBookmark(TREE, 'Deposition', 30);
    expect(next.map((item) => item.title)).toEqual(['Motion', 'Exhibits', 'Deposition']);
    expect(next.at(-1)).toEqual({ title: 'Deposition', page: 30, children: [] });
  });

  it('falls back to the page title when the attorney types nothing', () => {
    expect(appendBookmark([], '   ', 7).at(-1)?.title).toBe('Page 7');
    expect(defaultBookmarkTitle(7)).toBe('Page 7');
  });

  it('leaves the tree it was given untouched', () => {
    appendBookmark(TREE, 'Deposition', 30);
    expect(TREE).toHaveLength(2);
  });
});

describe('renaming a bookmark', () => {
  it('retitles a top-level heading and keeps its children', () => {
    const next = renameBookmark(TREE, [0], 'Notice of Motion');
    expect(next[0]?.title).toBe('Notice of Motion');
    expect(next[0]?.children.map((child) => child.title)).toEqual(['Argument', 'Conclusion']);
    expect(next[0]?.page).toBe(1);
  });

  it('retitles a nested heading without disturbing its siblings', () => {
    const next = renameBookmark(TREE, [0, 1], 'Relief requested');
    expect(next[0]?.children.map((child) => child.title)).toEqual(['Argument', 'Relief requested']);
    expect(next[1]?.title).toBe('Exhibits');
  });

  it('refuses to write a blank heading', () => {
    expect(renameBookmark(TREE, [0], '  ')).toEqual(TREE);
  });

  it('changes nothing when the path points at no bookmark', () => {
    expect(renameBookmark(TREE, [9], 'Ghost')).toEqual(TREE);
    expect(renameBookmark(TREE, [], 'Ghost')).toEqual(TREE);
  });
});

describe('removing a bookmark', () => {
  it('removes a leaf', () => {
    expect(removeBookmark(TREE, [1]).map((item) => item.title)).toEqual(['Motion']);
  });

  // Deleting one heading must not quietly take a branch of the exhibit set with it.
  it('lifts the children of a removed heading into its place', () => {
    const next = removeBookmark(TREE, [0]);
    expect(next.map((item) => item.title)).toEqual(['Argument', 'Conclusion', 'Exhibits']);
    expect(next.map((item) => item.page)).toEqual([4, 9, 12]);
  });

  it('removes a nested heading and leaves the rest of the branch alone', () => {
    const next = removeBookmark(TREE, [0, 0]);
    expect(next[0]?.children.map((child) => child.title)).toEqual(['Conclusion']);
  });

  it('changes nothing when the path points at no bookmark', () => {
    expect(removeBookmark(TREE, [4])).toEqual(TREE);
  });
});

describe('addressing a bookmark', () => {
  it('finds a node by its path', () => {
    expect(bookmarkAt(TREE, [0, 1])?.title).toBe('Conclusion');
    expect(bookmarkAt(TREE, [1])?.title).toBe('Exhibits');
    expect(bookmarkAt(TREE, [0, 5])).toBeUndefined();
  });

  it('compares paths by every step', () => {
    expect(samePath([0, 1], [0, 1])).toBe(true);
    expect(samePath([0, 1], [0, 2])).toBe(false);
    expect(samePath([0], [0, 1])).toBe(false);
  });
});

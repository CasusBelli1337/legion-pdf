import { describe, expect, it } from 'vitest';
import { getBookmarks } from './bookmarks';
import { reorderPages } from './reorder';
import {
  containsText,
  labelledPages,
  makeTestPdf,
  pageRotations,
  pageWidths,
} from './test-fixtures';

async function threePages(): Promise<Uint8Array> {
  return makeTestPdf({ pages: labelledPages(3, 'O', 800) });
}

describe('reorderPages', () => {
  it('applies a drag-and-drop permutation exactly', async () => {
    const result = await reorderPages(await threePages(), { order: [3, 1, 2] });

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(3);
    expect(await pageWidths(result.bytes)).toEqual([802, 800, 801]);
  });

  it('keeps every page in the document — nothing is dropped by a reorder', async () => {
    const source = await makeTestPdf({
      pages: [
        { label: 'FIRST-MARKER', width: 300 },
        { label: 'SECOND-MARKER', width: 301 },
      ],
    });
    const result = await reorderPages(source, { order: [2, 1] });

    expect(containsText(result.bytes, 'FIRST-MARKER')).toBe(true);
    expect(containsText(result.bytes, 'SECOND-MARKER')).toBe(true);
  });

  it('carries rotations with the pages they belong to', async () => {
    const source = await makeTestPdf({
      pages: [
        { label: 'A', width: 300, rotation: 0 },
        { label: 'B', width: 301, rotation: 90 },
        { label: 'C', width: 302, rotation: 180 },
      ],
    });
    const result = await reorderPages(source, { order: [2, 3, 1] });

    expect(await pageRotations(result.bytes)).toEqual([90, 180, 0]);
    expect(await pageWidths(result.bytes)).toEqual([301, 302, 300]);
  });

  it('follows bookmarks to the pages they were attached to', async () => {
    const source = await makeTestPdf({
      pages: labelledPages(3, 'O', 800),
      bookmarks: [{ title: 'Cover page', page: 1, children: [] }],
    });

    const result = await reorderPages(source, { order: [3, 2, 1] });

    expect(await getBookmarks(result.bytes)).toEqual([
      { title: 'Cover page', page: 3, children: [] },
    ]);
  });

  it('refuses an incomplete order, a duplicate, and a page that does not exist', async () => {
    const source = await threePages();
    await expect(reorderPages(source, { order: [1, 2] })).rejects.toThrow(
      /lists 2 pages but the document has 3/
    );
    await expect(reorderPages(source, { order: [1, 1, 2] })).rejects.toThrow(/lists page 1 twice/);
    await expect(reorderPages(source, { order: [1, 2, 4] })).rejects.toThrow(
      /page 4, which does not exist/
    );
  });

  it('reports progress for every page it places', async () => {
    const seen: [number, number][] = [];
    await reorderPages(await threePages(), { order: [2, 3, 1] }, (current, total) =>
      seen.push([current, total])
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { EmptyDocumentError } from '../pdf-meta';
import { getBookmarks } from './bookmarks';
import { mergeDocuments } from './merge';
import { labelledPages, makeTestPdf, pageRotations, pageWidths } from './test-fixtures';

const KEEP_BOOKMARKS = { preserveBookmarks: true };

async function threeFiles(): Promise<{ name: string; bytes: Uint8Array }[]> {
  return [
    { name: 'complaint.pdf', bytes: await makeTestPdf({ pages: labelledPages(2, 'A', 200) }) },
    { name: 'answer.pdf', bytes: await makeTestPdf({ pages: labelledPages(3, 'B', 300) }) },
    { name: 'exhibits.pdf', bytes: await makeTestPdf({ pages: labelledPages(4, 'C', 400) }) },
  ];
}

describe('mergeDocuments', () => {
  it('combines files of 2, 3, and 4 pages into exactly 9 pages in the chosen order', async () => {
    const result = await mergeDocuments(await threeFiles(), KEEP_BOOKMARKS);

    expect(result.pagesIn).toBe(9);
    expect(result.pagesOut).toBe(9);
    expect(result.detail.perSourcePages).toEqual([2, 3, 4]);
    expect(await pageWidths(result.bytes)).toEqual([200, 201, 300, 301, 302, 400, 401, 402, 403]);
  });

  it('honours a reordered file list', async () => {
    const [first, second, third] = await threeFiles();
    if (first === undefined || second === undefined || third === undefined)
      throw new Error('setup');
    const result = await mergeDocuments([third, first, second], KEEP_BOOKMARKS);

    expect(result.detail.perSourcePages).toEqual([4, 2, 3]);
    expect(await pageWidths(result.bytes)).toEqual([400, 401, 402, 403, 200, 201, 300, 301, 302]);
  });

  it('carries page rotations through the merge', async () => {
    const sources = [
      {
        name: 'landscape.pdf',
        bytes: await makeTestPdf({
          pages: [
            { label: 'R1', width: 200, height: 300, rotation: 90 },
            { label: 'R2', width: 201, height: 300, rotation: 180 },
          ],
        }),
      },
      { name: 'upright.pdf', bytes: await makeTestPdf({ pages: labelledPages(1, 'U', 300) }) },
    ];

    const result = await mergeDocuments(sources, KEEP_BOOKMARKS);
    expect(await pageRotations(result.bytes)).toEqual([90, 180, 0]);
  });

  it('nests each file’s own bookmarks under a top-level bookmark named after the file', async () => {
    const sources = [
      {
        name: 'complaint.pdf',
        bytes: await makeTestPdf({
          pages: labelledPages(2, 'A', 200),
          bookmarks: [{ title: 'First cause of action', page: 2, children: [] }],
        }),
      },
      {
        name: 'answer.pdf',
        bytes: await makeTestPdf({
          pages: labelledPages(3, 'B', 300),
          bookmarks: [
            {
              title: 'Affirmative defenses',
              page: 1,
              children: [{ title: 'Statute of limitations', page: 3, children: [] }],
            },
          ],
        }),
      },
    ];

    const result = await mergeDocuments(sources, KEEP_BOOKMARKS);
    const outline = await getBookmarks(result.bytes);

    expect(outline.map((node) => node.title)).toEqual(['complaint', 'answer']);
    expect(outline.map((node) => node.page)).toEqual([1, 3]);
    expect(outline[0]?.children).toEqual([
      { title: 'First cause of action', page: 2, children: [] },
    ]);
    expect(outline[1]?.children[0]?.title).toBe('Affirmative defenses');
    expect(outline[1]?.children[0]?.children[0]).toEqual({
      title: 'Statute of limitations',
      page: 5,
      children: [],
    });
  });

  it('writes no outline when the user turns bookmarks off', async () => {
    const result = await mergeDocuments(await threeFiles(), { preserveBookmarks: false });
    expect(await getBookmarks(result.bytes)).toEqual([]);
  });

  it('reports progress up to the true total page count', async () => {
    const seen: [number, number][] = [];
    await mergeDocuments(await threeFiles(), KEEP_BOOKMARKS, (current, total) =>
      seen.push([current, total])
    );
    expect(seen).toEqual([
      [2, 9],
      [5, 9],
      [9, 9],
    ]);
  });

  it('refuses an empty file list instead of writing an empty PDF', async () => {
    await expect(mergeDocuments([], KEEP_BOOKMARKS)).rejects.toThrow(
      'Combining needs at least one file — nothing was selected.'
    );
  });

  it('refuses a file that is empty on disk, naming the file', async () => {
    const sources = [
      { name: 'good.pdf', bytes: await makeTestPdf({ pages: labelledPages(1) }) },
      { name: 'broken.pdf', bytes: new Uint8Array() },
    ];
    await expect(mergeDocuments(sources, KEEP_BOOKMARKS)).rejects.toThrow(EmptyDocumentError);
    await expect(mergeDocuments(sources, KEEP_BOOKMARKS)).rejects.toThrow(/file "broken.pdf"/);
  });
});

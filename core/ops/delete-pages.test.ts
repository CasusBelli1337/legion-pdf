import { describe, expect, it } from 'vitest';
import { RangeCollapseError } from '@shared/types';
import { getBookmarks } from './bookmarks';
import { deletePages } from './delete-pages';
import { containsText, labelledPages, makeTestPdf, pageWidths } from './test-fixtures';

async function fourPages(): Promise<Uint8Array> {
  return makeTestPdf({ pages: labelledPages(4, 'D', 700) });
}

describe('deletePages', () => {
  it('removes the selected pages and keeps the rest in order', async () => {
    const result = await deletePages(await fourPages(), { pages: [2] });

    expect(result.pagesIn).toBe(4);
    expect(result.pagesOut).toBe(3);
    expect(await pageWidths(result.bytes)).toEqual([700, 702, 703]);
  });

  it('destroys the deleted page instead of detaching it from the page tree', async () => {
    const source = await makeTestPdf({
      pages: [
        { label: 'PUBLIC-ONE', width: 300 },
        { label: 'ATTORNEY-EYES-ONLY', width: 301 },
        { label: 'PUBLIC-TWO', width: 302 },
      ],
    });
    expect(containsText(source, 'ATTORNEY-EYES-ONLY')).toBe(true);

    const result = await deletePages(source, { pages: [2] });

    expect(containsText(result.bytes, 'ATTORNEY-EYES-ONLY')).toBe(false);
    expect(containsText(result.bytes, 'PUBLIC-ONE')).toBe(true);
    expect(containsText(result.bytes, 'PUBLIC-TWO')).toBe(true);
  });

  it('re-points surviving bookmarks and drops the ones whose page went', async () => {
    const source = await makeTestPdf({
      pages: labelledPages(4, 'D', 700),
      bookmarks: [
        { title: 'Cover', page: 1, children: [] },
        { title: 'Exhibit A', page: 2, children: [{ title: 'Attachment', page: 4, children: [] }] },
      ],
    });

    const result = await deletePages(source, { pages: [2] });

    expect(await getBookmarks(result.bytes)).toEqual([
      { title: 'Cover', page: 1, children: [] },
      { title: 'Attachment', page: 3, children: [] },
    ]);
  });

  it('throws RangeCollapseError rather than delete every page', async () => {
    await expect(deletePages(await fourPages(), { pages: [1, 2, 3, 4] })).rejects.toThrow(
      RangeCollapseError
    );
  });

  it('throws RangeCollapseError on an empty selection', async () => {
    await expect(deletePages(await fourPages(), { pages: [] })).rejects.toThrow(RangeCollapseError);
  });

  it('refuses a page the document does not have', async () => {
    await expect(deletePages(await fourPages(), { pages: [99] })).rejects.toThrow(
      'The pages to delete includes page 99, but this document has pages 1 through 4.'
    );
  });
});

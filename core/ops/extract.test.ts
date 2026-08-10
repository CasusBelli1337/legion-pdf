import { describe, expect, it } from 'vitest';
import { RangeCollapseError } from '@shared/types';
import { extractPages } from './extract';
import { containsText, labelledPages, makeTestPdf, pageWidths } from './test-fixtures';

async function fivePages(): Promise<Uint8Array> {
  return makeTestPdf({ pages: labelledPages(5, 'EX', 600) });
}

describe('extractPages', () => {
  it('pulls the selected pages into a new document and leaves the source alone', async () => {
    const source = await fivePages();
    const result = await extractPages(source, { pages: [2, 4], removeFromSource: false });

    expect(result.pagesIn).toBe(5);
    expect(result.pagesOut).toBe(2);
    expect(result.detail.extractedPages).toEqual([2, 4]);
    expect(await pageWidths(result.bytes)).toEqual([601, 603]);
    expect(result.detail.sourceBytes).toBe(source);
    expect(result.detail.sourcePageCount).toBe(5);
  });

  it('removes the extracted pages from the source when asked', async () => {
    const result = await extractPages(await fivePages(), { pages: [2, 4], removeFromSource: true });

    expect(result.detail.sourcePageCount).toBe(3);
    expect(await pageWidths(result.detail.sourceBytes)).toEqual([600, 602, 604]);
  });

  it('leaves no trace of an extracted page in the trimmed source', async () => {
    const source = await makeTestPdf({
      pages: [
        { label: 'KEEP-ONE', width: 300 },
        { label: 'PRIVILEGED-MEMO', width: 301 },
        { label: 'KEEP-TWO', width: 302 },
      ],
    });
    expect(containsText(source, 'PRIVILEGED-MEMO')).toBe(true);

    const result = await extractPages(source, { pages: [2], removeFromSource: true });

    expect(containsText(result.detail.sourceBytes, 'PRIVILEGED-MEMO')).toBe(false);
    expect(containsText(result.detail.sourceBytes, 'KEEP-ONE')).toBe(true);
    expect(containsText(result.bytes, 'PRIVILEGED-MEMO')).toBe(true);
  });

  it('de-duplicates and sorts a scattered selection', async () => {
    const result = await extractPages(await fivePages(), {
      pages: [5, 1, 5],
      removeFromSource: false,
    });
    expect(result.detail.extractedPages).toEqual([1, 5]);
    expect(await pageWidths(result.bytes)).toEqual([600, 604]);
  });

  it('throws RangeCollapseError on an empty selection', async () => {
    await expect(
      extractPages(await fivePages(), { pages: [], removeFromSource: false })
    ).rejects.toThrow(RangeCollapseError);
  });

  it('throws RangeCollapseError rather than extract every page and empty the source', async () => {
    await expect(
      extractPages(await fivePages(), { pages: [1, 2, 3, 4, 5], removeFromSource: true })
    ).rejects.toThrow(RangeCollapseError);
  });

  it('refuses a page the document does not have', async () => {
    await expect(
      extractPages(await fivePages(), { pages: [6], removeFromSource: false })
    ).rejects.toThrow(
      'The page selection includes page 6, but this document has pages 1 through 5.'
    );
  });
});

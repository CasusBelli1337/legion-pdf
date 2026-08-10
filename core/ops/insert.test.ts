import { describe, expect, it } from 'vitest';
import { insertBlankPages, insertPagesFrom } from './insert';
import { containsText, labelledPages, makeTestPdf, pageWidths } from './test-fixtures';

async function threePages(): Promise<Uint8Array> {
  return makeTestPdf({ pages: labelledPages(3, 'I', 400) });
}

describe('insertBlankPages', () => {
  it('puts one blank page at the chosen position, sized like the page it lands before', async () => {
    const result = await insertBlankPages(await threePages(), { atPage: 2, count: 1 });

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(4);
    expect(await pageWidths(result.bytes)).toEqual([400, 401, 401, 402]);
  });

  it('appends when the position is one past the last page', async () => {
    const result = await insertBlankPages(await threePages(), { atPage: 4, count: 2 });

    expect(result.pagesOut).toBe(5);
    expect(await pageWidths(result.bytes)).toEqual([400, 401, 402, 402, 402]);
  });

  it('honours an explicit page size', async () => {
    const result = await insertBlankPages(await threePages(), {
      atPage: 1,
      count: 1,
      size: { width: 612, height: 792 },
    });
    expect(await pageWidths(result.bytes)).toEqual([612, 400, 401, 402]);
  });

  it('matches a rotated neighbour’s landscape shape', async () => {
    const source = await makeTestPdf({
      pages: [{ label: 'LAND', width: 200, height: 500, rotation: 90 }],
    });
    const result = await insertBlankPages(source, { atPage: 1, count: 1 });

    expect(await pageWidths(result.bytes)).toEqual([500, 200]);
  });

  it('refuses a position outside the document and a nonsense count', async () => {
    const source = await threePages();
    await expect(insertBlankPages(source, { atPage: 0, count: 1 })).rejects.toThrow(
      'Pages can go in at positions 1 through 4 of this document, not 0.'
    );
    await expect(insertBlankPages(source, { atPage: 5, count: 1 })).rejects.toThrow(/not 5/);
    await expect(insertBlankPages(source, { atPage: 1, count: 0 })).rejects.toThrow(
      /Insert between 1 and 500 blank pages/
    );
  });
});

describe('insertPagesFrom', () => {
  it('inserts every page of another file at the chosen position', async () => {
    const source = await makeTestPdf({ pages: labelledPages(2, 'S', 700) });
    const result = await insertPagesFrom(await threePages(), { atPage: 2, sourceBytes: source });

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(5);
    expect(await pageWidths(result.bytes)).toEqual([400, 700, 701, 401, 402]);
  });

  it('inserts only the requested pages, in document order', async () => {
    const source = await makeTestPdf({ pages: labelledPages(4, 'S', 700) });
    const result = await insertPagesFrom(await threePages(), {
      atPage: 4,
      sourceBytes: source,
      sourcePages: [4, 1],
    });

    expect(result.pagesOut).toBe(5);
    expect(await pageWidths(result.bytes)).toEqual([400, 401, 402, 700, 703]);
  });

  it('brings the inserted page’s content with it', async () => {
    const source = await makeTestPdf({ pages: [{ label: 'INSERTED-EXHIBIT', width: 300 }] });
    const result = await insertPagesFrom(await threePages(), { atPage: 1, sourceBytes: source });

    expect(containsText(result.bytes, 'INSERTED-EXHIBIT')).toBe(true);
  });

  it('refuses a page the other file does not have', async () => {
    const source = await makeTestPdf({ pages: labelledPages(2, 'S', 700) });
    await expect(
      insertPagesFrom(await threePages(), { atPage: 1, sourceBytes: source, sourcePages: [3] })
    ).rejects.toThrow(
      'The pages to insert includes page 3, but this document has pages 1 through 2.'
    );
  });

  it('refuses an empty file rather than insert nothing and report success', async () => {
    await expect(
      insertPagesFrom(await threePages(), { atPage: 1, sourceBytes: new Uint8Array() })
    ).rejects.toThrow(/file being inserted is empty/);
  });
});

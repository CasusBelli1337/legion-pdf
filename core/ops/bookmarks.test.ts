import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import type { BookmarkNode } from '@shared/types';
import { getBookmarks, setBookmarks } from './bookmarks';
import { countBookmarks } from './bookmarks-read';
import {
  containsText,
  labelledPages,
  makeTestPdf,
  withNamedDestinationOutline,
} from './test-fixtures';

const TREE: BookmarkNode[] = [
  {
    title: 'Notice of Motion',
    page: 1,
    children: [
      { title: 'Relief requested', page: 2, children: [] },
      {
        title: 'Memorandum of Points and Authorities',
        page: 3,
        children: [{ title: 'Statement of facts', page: 4, children: [] }],
      },
    ],
  },
  { title: 'Declaration of A. Rothrock', page: 5, children: [] },
];

async function sixPages(): Promise<Uint8Array> {
  return makeTestPdf({ pages: labelledPages(6, 'B', 300) });
}

/** Reads the raw outline dictionaries so the wiring itself is under test. */
async function outlineDictionaries(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const root = document.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  const items: PDFDict[] = [];
  const walk = (ref: unknown): void => {
    if (!(ref instanceof PDFRef)) return;
    const item = document.context.lookupMaybe(ref, PDFDict);
    if (item === undefined) return;
    items.push(item);
    walk(item.get(PDFName.of('First')));
    walk(item.get(PDFName.of('Next')));
  };
  walk(root?.get(PDFName.of('First')));
  return { document, root, items };
}

describe('setBookmarks / getBookmarks', () => {
  it('writes a nested outline and reads back exactly what went in', async () => {
    const result = await setBookmarks(await sixPages(), TREE);

    expect(result.pagesIn).toBe(6);
    expect(result.pagesOut).toBe(6);
    expect(await getBookmarks(result.bytes)).toEqual(TREE);
  });

  it('wires /Parent, /Prev, /Next, /First, /Last, and /Count the way a reader expects', async () => {
    const result = await setBookmarks(await sixPages(), TREE);
    const { root, items } = await outlineDictionaries(result.bytes);

    expect(root?.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber()).toBe(
      countBookmarks(TREE)
    );
    expect(root?.get(PDFName.of('First'))).toBeInstanceOf(PDFRef);
    expect(root?.get(PDFName.of('Last'))).toBeInstanceOf(PDFRef);
    expect(items).toHaveLength(countBookmarks(TREE));
    for (const item of items) {
      expect(item.get(PDFName.of('Parent'))).toBeInstanceOf(PDFRef);
      expect(item.get(PDFName.of('Dest'))).toBeDefined();
    }
    const firstTop = items[0];
    expect(firstTop?.get(PDFName.of('Prev'))).toBeUndefined();
    expect(firstTop?.get(PDFName.of('Next'))).toBeInstanceOf(PDFRef);
    expect(firstTop?.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber()).toBe(3);
  });

  it('keeps a unicode title intact', async () => {
    const tree = [{ title: 'Exhibit A – Declaración de José', page: 2, children: [] }];
    const result = await setBookmarks(await sixPages(), tree);

    expect(await getBookmarks(result.bytes)).toEqual(tree);
  });

  it('replaces an outline and leaves no trace of the old titles', async () => {
    const first = await setBookmarks(await sixPages(), [
      { title: 'PRIVILEGED-WORK-PRODUCT', page: 1, children: [] },
    ]);
    expect(containsText(first.bytes, 'PRIVILEGED-WORK-PRODUCT')).toBe(true);

    const second = await setBookmarks(first.bytes, [
      { title: 'Production copy', page: 1, children: [] },
    ]);

    expect(containsText(second.bytes, 'PRIVILEGED-WORK-PRODUCT')).toBe(false);
    expect(await getBookmarks(second.bytes)).toEqual([
      { title: 'Production copy', page: 1, children: [] },
    ]);
  });

  it('treats an empty tree as "remove every bookmark", not as a collapsed window', async () => {
    const withOutline = await setBookmarks(await sixPages(), TREE);
    const cleared = await setBookmarks(withOutline.bytes, []);

    expect(cleared.pagesOut).toBe(6);
    expect(await getBookmarks(cleared.bytes)).toEqual([]);
  });

  it('refuses a bookmark pointing past the end of the document', async () => {
    await expect(
      setBookmarks(await sixPages(), [{ title: 'Nowhere', page: 9, children: [] }])
    ).rejects.toThrow('Invalid bookmark page 9: this document has pages 1 through 6.');
  });

  it('refuses a bookmark pointing past the end from deep in the tree', async () => {
    const tree = [{ title: 'Top', page: 1, children: [{ title: 'Deep', page: 42, children: [] }] }];
    await expect(setBookmarks(await sixPages(), tree)).rejects.toThrow(/Invalid bookmark page 42/);
  });
});

describe('getBookmarks on outlines written by other producers', () => {
  it('follows a /A GoTo action through a named destination', async () => {
    const source = await withNamedDestinationOutline(await sixPages(), 'Chapter One', 4);

    expect(await getBookmarks(source)).toEqual([{ title: 'Chapter One', page: 4, children: [] }]);
  });

  it('returns an empty tree for a document with no outline', async () => {
    expect(await getBookmarks(await sixPages())).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

vi.mock('./pdfjs', () => ({ loadDocument: vi.fn() }));

import { loadDocument } from './pdfjs';
import { NoTextLayerError, extractDocumentText, pageBlock, resolveTextPages } from './extract-text';

const BYTES = new Uint8Array([1, 2, 3]);

interface FakeDoc {
  document: PDFDocumentProxy;
  requestedPages: number[];
  destroyed: () => boolean;
}

/** A pdfjs stand-in whose text content is dictated per page. */
function fakeDocument(
  pages: Record<number, string>,
  pageCount = Object.keys(pages).length
): FakeDoc {
  const requestedPages: number[] = [];
  let destroyed = false;
  const document = {
    numPages: pageCount,
    async getPage(page: number) {
      requestedPages.push(page);
      const text = pages[page] ?? '';
      return {
        async getTextContent() {
          return {
            items: text === '' ? [] : [{ str: text, hasEOL: true }, { str: 'not-text' }],
          };
        },
      };
    },
    loadingTask: {
      async destroy() {
        destroyed = true;
      },
    },
  };
  return {
    document: document as unknown as PDFDocumentProxy,
    requestedPages,
    destroyed: () => destroyed,
  };
}

beforeEach(() => {
  vi.mocked(loadDocument).mockReset();
});

describe('resolveTextPages', () => {
  it('reads the whole document when no range is given', () => {
    expect(resolveTextPages(undefined, 4)).toEqual([1, 2, 3, 4]);
  });

  it('normalises a hand-typed range: sorted, de-duplicated', () => {
    expect(resolveTextPages([5, 2, 2, 3], 10)).toEqual([2, 3, 5]);
  });

  it('fails loudly on a page outside the real document', () => {
    expect(() => resolveTextPages([1, 11], 10)).toThrow(/pages 1 through 10/);
    expect(() => resolveTextPages([0], 10)).toThrow(RangeError);
    expect(() => resolveTextPages([2.5], 10)).toThrow(RangeError);
    expect(() => resolveTextPages([-3], 10)).toThrow(RangeError);
  });

  it('fails loudly rather than returning an empty selection', () => {
    expect(() => resolveTextPages([], 10)).toThrow(/No pages selected/);
  });

  it('rejects a document that claims no pages', () => {
    expect(() => resolveTextPages(undefined, 0)).toThrow(RangeError);
  });
});

describe('pageBlock', () => {
  it('labels the page so Centurion can cite it', () => {
    expect(pageBlock(14, 'Some text')).toBe('[Page 14]\nSome text');
  });
});

describe('extractDocumentText', () => {
  it('extracts and labels every page of a whole document', async () => {
    const fake = fakeDocument({ 1: 'First page', 2: 'Second page' });
    vi.mocked(loadDocument).mockResolvedValue(fake.document);

    const result = await extractDocumentText(BYTES);

    expect(result.pages).toEqual([1, 2]);
    expect(result.text).toBe('[Page 1]\nFirst page\n\n[Page 2]\nSecond page');
    expect(result.charsPerPage).toEqual(['First page'.length, 'Second page'.length]);
    expect(fake.destroyed()).toBe(true);
  });

  it('reads only the requested pages when a range is given', async () => {
    const fake = fakeDocument({ 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four' });
    vi.mocked(loadDocument).mockResolvedValue(fake.document);

    const result = await extractDocumentText(BYTES, [2, 3]);

    expect(fake.requestedPages).toEqual([2, 3]);
    expect(result.pages).toEqual([2, 3]);
    expect(result.text).toBe('[Page 2]\nTwo\n\n[Page 3]\nThree');
  });

  it('validates the window before reading anything, so it can never collapse silently', async () => {
    const fake = fakeDocument({ 1: 'One', 2: 'Two' });
    vi.mocked(loadDocument).mockResolvedValue(fake.document);

    await expect(extractDocumentText(BYTES, [3, 9])).rejects.toThrow(/pages 1 through 2/);
    expect(fake.requestedPages).toEqual([]);
    expect(fake.destroyed()).toBe(true);
  });

  it('refuses an empty selection rather than sending an empty prompt', async () => {
    const fake = fakeDocument({ 1: 'One' });
    vi.mocked(loadDocument).mockResolvedValue(fake.document);

    await expect(extractDocumentText(BYTES, [])).rejects.toThrow(/No pages selected/);
    expect(fake.requestedPages).toEqual([]);
  });

  it('reports an image-only selection as needing OCR, not as an empty answer', async () => {
    const fake = fakeDocument({ 1: '', 2: '' });
    vi.mocked(loadDocument).mockResolvedValue(fake.document);

    await expect(extractDocumentText(BYTES)).rejects.toBeInstanceOf(NoTextLayerError);
    await expect(extractDocumentText(BYTES)).rejects.toThrow(/Run Text Recognition first/);
  });

  it('keeps a partially scanned document, and counts the blank pages', async () => {
    const fake = fakeDocument({ 1: 'Readable', 2: '' });
    vi.mocked(loadDocument).mockResolvedValue(fake.document);

    const result = await extractDocumentText(BYTES);

    expect(result.charsPerPage).toEqual([8, 0]);
    expect(result.text).toBe('[Page 1]\nReadable\n\n[Page 2]\n');
  });
});

/**
 * The bulk-OCR raster path: a document that main opened but the renderer never
 * put in a tab. What matters is that its bytes are fetched at all, that a
 * 200-page scan is parsed once rather than once per page, and that the previous
 * document is torn down when the run moves on.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSession } from '@shared/types';
import { DetachedDocuments } from './detached-raster';
import { loadDocument } from './pdfjs';

vi.mock('./pdfjs', () => ({ loadDocument: vi.fn() }));

interface FakeDocument {
  numPages: number;
  loadingTask: { destroy: ReturnType<typeof vi.fn> };
}

function fakeDocument(numPages = 3): FakeDocument {
  return { numPages, loadingTask: { destroy: vi.fn(async () => undefined) } };
}

function session(docId: string): DocumentSession {
  return {
    id: docId,
    filePath: `/in/${docId}.pdf`,
    fileName: `${docId}.pdf`,
    bytes: new Uint8Array([37, 80, 68, 70]),
    pageCount: 3,
    dirty: false,
  };
}

function stubBridge(): ReturnType<typeof vi.fn> {
  const read = vi.fn(async (docId: string) => session(docId));
  Object.defineProperty(globalThis, 'window', {
    value: { librarius: { file: { read } } },
    configurable: true,
    writable: true,
  });
  return read;
}

const load = vi.mocked(loadDocument);

afterEach(() => {
  vi.clearAllMocks();
});

describe('DetachedDocuments', () => {
  it('pulls the bytes back over file:read for a document with no tab', async () => {
    const read = stubBridge();
    const document = fakeDocument();
    load.mockResolvedValue(document as never);

    const opened = await new DetachedDocuments().open('bulk-1');

    expect(read).toHaveBeenCalledExactlyOnceWith('bulk-1');
    expect(load).toHaveBeenCalledExactlyOnceWith(session('bulk-1').bytes);
    expect(opened).toBe(document);
  });

  it('parses one document once, however many pages ask for it', async () => {
    const read = stubBridge();
    load.mockResolvedValue(fakeDocument(200) as never);
    const cache = new DetachedDocuments();

    for (let page = 1; page <= 5; page += 1) await cache.open('bulk-1');

    expect(read).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one load between pages rasterized at the same time', async () => {
    const read = stubBridge();
    load.mockResolvedValue(fakeDocument() as never);
    const cache = new DetachedDocuments();

    const [first, second] = await Promise.all([cache.open('bulk-1'), cache.open('bulk-1')]);

    expect(first).toBe(second);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('destroys the previous document when the run moves to the next file', async () => {
    stubBridge();
    const first = fakeDocument();
    const second = fakeDocument();
    load.mockResolvedValueOnce(first as never).mockResolvedValueOnce(second as never);
    const cache = new DetachedDocuments();

    await cache.open('bulk-1');
    await cache.open('bulk-2');

    expect(first.loadingTask.destroy).toHaveBeenCalledTimes(1);
    expect(second.loadingTask.destroy).not.toHaveBeenCalled();
  });

  it('destroys what it holds on dispose, and tolerates a second dispose', async () => {
    stubBridge();
    const document = fakeDocument();
    load.mockResolvedValue(document as never);
    const cache = new DetachedDocuments();

    await cache.open('bulk-1');
    await cache.dispose();
    await cache.dispose();

    expect(document.loadingTask.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a document that failed to load', async () => {
    stubBridge();
    load.mockRejectedValueOnce(new Error('Cannot open an empty document.'));
    load.mockResolvedValueOnce(fakeDocument() as never);
    const cache = new DetachedDocuments();

    await expect(cache.open('bulk-1')).rejects.toThrow(/empty document/);
    await expect(cache.open('bulk-1')).resolves.toBeDefined();
  });
});

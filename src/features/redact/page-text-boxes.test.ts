import { describe, expect, it, vi } from 'vitest';

const loadDocument = vi.fn();

vi.mock('@renderer/lib/pdfjs', () => ({ loadDocument }));

const { itemRect, readPageTextBoxes } = await import('./page-text-boxes');

const BYTES = Uint8Array.from([1, 2, 3]);

function item(str: string, x: number, y: number, width = 60, height = 10) {
  return { str, transform: [10, 0, 0, 10, x, y], width, height };
}

const destroy = vi.fn().mockResolvedValue(undefined);

/** A pdfjs document whose pages hand back the items they were built with. */
function fakeDocument(pages: Record<number, unknown[]>, numPages = 4) {
  return {
    numPages,
    loadingTask: { destroy },
    getPage: (page: number) =>
      Promise.resolve({ getTextContent: () => Promise.resolve({ items: pages[page] ?? [] }) }),
  };
}

describe('itemRect', () => {
  it('anchors the box on the run baseline, as the viewer search does', () => {
    expect(itemRect(item('SSN', 72, 650, 90, 12))).toEqual({
      x: 72,
      y: 650,
      width: 90,
      height: 12,
    });
  });

  it('never reports a zero-area box, which would divide by nothing downstream', () => {
    const flat = itemRect({ str: 'x', transform: [1, 0, 0, 1, 5, 5], width: 0, height: 0 });
    expect(flat.width).toBeGreaterThan(0);
    expect(flat.height).toBeGreaterThan(0);
  });
});

describe('readPageTextBoxes', () => {
  it('reads every run on the named pages, with its position', async () => {
    loadDocument.mockResolvedValueOnce(fakeDocument({ 2: [item('SSN 545-45-6789', 72, 650)] }));
    await expect(readPageTextBoxes(BYTES, [2])).resolves.toEqual([
      {
        page: 2,
        boxes: [{ text: 'SSN 545-45-6789', rect: { x: 72, y: 650, width: 60, height: 10 } }],
      },
    ]);
  });

  it('reports a page that yields nothing rather than dropping it', async () => {
    loadDocument.mockResolvedValueOnce(fakeDocument({ 1: [] }));
    await expect(readPageTextBoxes(BYTES, [1])).resolves.toEqual([{ page: 1, boxes: [] }]);
  });

  it('skips the marked-content markers pdfjs mixes into the item list', async () => {
    loadDocument.mockResolvedValueOnce(fakeDocument({ 1: [{ type: 'beginMarkedContent' }] }));
    await expect(readPageTextBoxes(BYTES, [1])).resolves.toEqual([{ page: 1, boxes: [] }]);
  });

  // Engineering rule 1: a window that collapses is a loud error, never an empty
  // success that would read as a page proved clean.
  it('refuses a page outside the document', async () => {
    loadDocument.mockResolvedValueOnce(fakeDocument({}, 2));
    await expect(readPageTextBoxes(BYTES, [7])).rejects.toThrow(/pages 1 through 2/);
  });

  it('tears the worker down even when a page could not be read', async () => {
    destroy.mockClear();
    loadDocument.mockResolvedValueOnce(fakeDocument({}, 1));
    await expect(readPageTextBoxes(BYTES, [9])).rejects.toThrow(RangeError);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

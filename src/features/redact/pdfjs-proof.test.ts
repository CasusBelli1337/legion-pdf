import { describe, expect, it, vi } from 'vitest';
import type { PdfRect } from '@shared/types';

const readPageTextBoxes = vi.fn();

vi.mock('./page-text-boxes', () => ({ readPageTextBoxes }));

const { isClean, proveWithPdfjs } = await import('./pdfjs-proof');
const { padRect } = await import('./mark-geometry');

const BYTES = Uint8Array.from([1, 2, 3]);
const CLEAN = { survivingStrings: [], textInMarkedAreas: [], pagesStillCarryingText: [] };

/** A text run where the viewer's search would have put one: baseline origin. */
function run(text: string, x: number, y: number, width = 60, height = 10) {
  return { text, rect: { x, y, width, height } };
}

/** The secret's own box, and the mark a search hit would have grown around it. */
const SECRET_BOX = run('SSN 545-45-6789', 72, 650, 90, 10);
const SECRET_MARK: PdfRect = padRect(SECRET_BOX.rect);

function marked(page: number, rect: PdfRect, text = 'SSN 545-45-6789') {
  return { page, rect, text };
}

describe('proveWithPdfjs', () => {
  it('treats an image-only rebuilt page as the proof, not a failure', async () => {
    readPageTextBoxes.mockResolvedValueOnce([{ page: 2, boxes: [] }]);
    await expect(
      proveWithPdfjs({
        bytes: BYTES,
        pages: [2],
        areas: [marked(2, SECRET_MARK)],
        expectNoText: true,
      })
    ).resolves.toEqual(CLEAN);
  });

  /** The burn missed: pdfjs reads the secret back out of the marked rectangle. */
  it('reports text still readable INSIDE a marked area', async () => {
    readPageTextBoxes.mockResolvedValueOnce([{ page: 2, boxes: [SECRET_BOX] }]);
    const findings = await proveWithPdfjs({
      bytes: BYTES,
      pages: [2],
      areas: [marked(2, SECRET_MARK)],
      expectNoText: false,
    });
    expect(findings.textInMarkedAreas).toEqual(['SSN 545-45-6789']);
    expect(isClean(findings)).toBe(false);
  });

  /**
   * QA F-1 at the renderer gate. An identical copy of the marked words further
   * down the same rebuilt page was never marked — re-OCR putting it back is the
   * correct outcome, not a failed redaction.
   */
  it('ignores the same words elsewhere on the page, which nobody marked', async () => {
    readPageTextBoxes.mockResolvedValueOnce([
      { page: 2, boxes: [run('SSN 545-45-6789', 72, 300, 90, 10)] },
    ]);
    await expect(
      proveWithPdfjs({
        bytes: BYTES,
        pages: [2],
        areas: [marked(2, SECRET_MARK)],
        expectNoText: false,
      })
    ).resolves.toEqual(CLEAN);
  });

  /**
   * Search-derived marks are grown QUAD_PADDING_PT on every side, so a mark
   * reaches a couple of points into the word beside it. A neighbour grazed by
   * that padding must not read as a survivor.
   */
  it('does not flag a neighbouring word the mark only grazes', async () => {
    const neighbour = run('closing', SECRET_BOX.rect.x + SECRET_BOX.rect.width + 1, 650, 40, 10);
    readPageTextBoxes.mockResolvedValueOnce([{ page: 2, boxes: [neighbour] }]);
    const findings = await proveWithPdfjs({
      bytes: BYTES,
      pages: [2],
      areas: [marked(2, SECRET_MARK)],
      expectNoText: false,
    });
    expect(findings.textInMarkedAreas).toEqual([]);
  });

  it('keeps marks on the page they belong to', async () => {
    readPageTextBoxes.mockResolvedValueOnce([{ page: 3, boxes: [SECRET_BOX] }]);
    const findings = await proveWithPdfjs({
      bytes: BYTES,
      pages: [3],
      areas: [marked(1, SECRET_MARK)],
      expectNoText: false,
    });
    expect(findings.textInMarkedAreas).toEqual([]);
  });

  it('flags a rebuilt page that still yields selectable text at all', async () => {
    readPageTextBoxes.mockResolvedValueOnce([
      { page: 1, boxes: [] },
      { page: 3, boxes: [run('still here', 10, 10)] },
    ]);
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [1, 3], areas: [], expectNoText: true })
    ).resolves.toEqual({ ...CLEAN, pagesStillCarryingText: [3] });
  });

  it('allows text on a rebuilt page when re-OCR deliberately put it there', async () => {
    readPageTextBoxes.mockResolvedValueOnce([
      { page: 1, boxes: [run('clean recognized text', 10, 10)] },
    ]);
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [1], areas: [], expectNoText: false })
    ).resolves.toEqual(CLEAN);
  });

  it('ignores whitespace-only runs, which show nothing', async () => {
    readPageTextBoxes.mockResolvedValueOnce([{ page: 1, boxes: [run('   ', 72, 650, 90, 10)] }]);
    await expect(
      proveWithPdfjs({
        bytes: BYTES,
        pages: [1],
        areas: [marked(1, SECRET_MARK)],
        expectNoText: true,
      })
    ).resolves.toEqual(CLEAN);
  });

  /**
   * A burn that worked leaves an opaque rectangle, and re-OCR reads a couple of
   * junk glyphs off it — "ii" is the one this fixture's black box produced live.
   * Calling that a surviving redaction refuses honest work; only the marked text
   * itself, or a real piece of it, counts.
   */
  it('ignores the noise re-OCR reads off the black rectangle', async () => {
    readPageTextBoxes.mockResolvedValueOnce([{ page: 1, boxes: [run('ii', 80, 650, 20, 10)] }]);
    await expect(
      proveWithPdfjs({
        bytes: BYTES,
        pages: [1],
        areas: [marked(1, SECRET_MARK)],
        expectNoText: false,
      })
    ).resolves.toEqual(CLEAN);
  });

  it('reports a real PIECE of the marked text read back from inside the mark', async () => {
    readPageTextBoxes.mockResolvedValueOnce([
      { page: 1, boxes: [run('45-6789', 80, 650, 40, 10)] },
    ]);
    const findings = await proveWithPdfjs({
      bytes: BYTES,
      pages: [1],
      areas: [marked(1, SECRET_MARK)],
      expectNoText: false,
    });
    expect(findings.textInMarkedAreas).toEqual(['45-6789']);
  });

  it('reports the term even when re-OCR split it into words', async () => {
    readPageTextBoxes.mockResolvedValueOnce([
      { page: 1, boxes: [run('SSN', 74, 650, 20, 10), run('545-45-6789', 96, 650, 60, 10)] },
    ]);
    const findings = await proveWithPdfjs({
      bytes: BYTES,
      pages: [1],
      areas: [marked(1, SECRET_MARK)],
      expectNoText: false,
    });
    expect(findings.textInMarkedAreas).toEqual(['SSN 545-45-6789']);
  });

  /**
   * A hand-drawn box names no text, so this gate can claim nothing about it.
   * Page silence (re-OCR off) and the burn's own painted-pixel count carry it.
   */
  it('claims nothing about a hand-drawn box, which names no text', async () => {
    readPageTextBoxes.mockResolvedValueOnce([
      { page: 1, boxes: [run('anything at all', 72, 650, 90, 10)] },
    ]);
    await expect(
      proveWithPdfjs({
        bytes: BYTES,
        pages: [1],
        areas: [{ page: 1, rect: SECRET_MARK }],
        expectNoText: false,
      })
    ).resolves.toEqual(CLEAN);
  });

  it('has nothing to prove when no page was rebuilt', async () => {
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [], areas: [], expectNoText: true })
    ).resolves.toEqual(CLEAN);
    expect(readPageTextBoxes).not.toHaveBeenCalledWith(BYTES, []);
  });

  it('is only clean when EVERY failure list is empty', () => {
    expect(isClean(CLEAN)).toBe(true);
    expect(isClean({ ...CLEAN, survivingStrings: ['SSN 1'] })).toBe(false);
    expect(isClean({ ...CLEAN, textInMarkedAreas: ['SSN 1'] })).toBe(false);
    expect(isClean({ ...CLEAN, pagesStillCarryingText: [3] })).toBe(false);
  });

  it('lets a real extraction failure through rather than calling it proof', async () => {
    readPageTextBoxes.mockRejectedValueOnce(new Error('the file is corrupt'));
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [1], areas: [], expectNoText: true })
    ).rejects.toThrow('the file is corrupt');
  });
});

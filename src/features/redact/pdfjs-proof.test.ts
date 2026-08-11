import { describe, expect, it, vi } from 'vitest';

const extractDocumentText = vi.fn();

vi.mock('@renderer/lib/extract-text', () => ({
  extractDocumentText,
  NoTextLayerError: class NoTextLayerError extends Error {
    readonly code = 'NO_TEXT_LAYER';
    constructor(readonly pages: number[]) {
      super('no text');
      this.name = 'NoTextLayerError';
    }
  },
}));

const { NoTextLayerError } = await import('@renderer/lib/extract-text');
const { isClean, proveWithPdfjs } = await import('./pdfjs-proof');

const BYTES = Uint8Array.from([1, 2, 3]);
const CLEAN = { survivingStrings: [], pagesStillCarryingText: [] };

describe('proveWithPdfjs', () => {
  it('treats an image-only rebuilt page as the proof, not a failure', async () => {
    extractDocumentText.mockRejectedValueOnce(new NoTextLayerError([2]));
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [2], needles: ['SSN 1'], expectNoText: true })
    ).resolves.toEqual(CLEAN);
  });

  it('reports a marked string pdfjs can still read back', async () => {
    extractDocumentText.mockResolvedValueOnce({
      text: '[Page 2]\nAccount SSN 545-45-6789 remains',
      pages: [2],
      charsPerPage: [31],
    });
    await expect(
      proveWithPdfjs({
        bytes: BYTES,
        pages: [2],
        needles: ['SSN 545-45-6789'],
        expectNoText: false,
      })
    ).resolves.toEqual({ survivingStrings: ['SSN 545-45-6789'], pagesStillCarryingText: [] });
  });

  it('matches regardless of case', async () => {
    extractDocumentText.mockResolvedValueOnce({
      text: 'ssn 545-45-6789',
      pages: [2],
      charsPerPage: [15],
    });
    const findings = await proveWithPdfjs({
      bytes: BYTES,
      pages: [2],
      needles: ['SSN 545-45-6789'],
      expectNoText: false,
    });
    expect(findings.survivingStrings).toEqual(['SSN 545-45-6789']);
    expect(isClean(findings)).toBe(false);
  });

  it('flags a rebuilt page that still yields selectable text at all', async () => {
    extractDocumentText.mockResolvedValueOnce({
      text: '[Page 1]\n\n[Page 3]\nstill here',
      pages: [1, 3],
      charsPerPage: [0, 10],
    });
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [1, 3], needles: [], expectNoText: true })
    ).resolves.toEqual({ survivingStrings: [], pagesStillCarryingText: [3] });
  });

  it('allows text on a rebuilt page when re-OCR deliberately put it there', async () => {
    extractDocumentText.mockResolvedValueOnce({
      text: 'clean recognized text',
      pages: [1],
      charsPerPage: [21],
    });
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [1], needles: ['SSN 1'], expectNoText: false })
    ).resolves.toEqual(CLEAN);
  });

  it('has nothing to prove when no page was rebuilt', async () => {
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [], needles: ['SSN 1'], expectNoText: true })
    ).resolves.toEqual(CLEAN);
    expect(extractDocumentText).not.toHaveBeenCalledWith(BYTES, []);
  });

  it('is only clean when BOTH failure lists are empty', () => {
    expect(isClean(CLEAN)).toBe(true);
    expect(isClean({ survivingStrings: ['SSN 1'], pagesStillCarryingText: [] })).toBe(false);
    expect(isClean({ survivingStrings: [], pagesStillCarryingText: [3] })).toBe(false);
  });

  it('lets a real extraction failure through rather than calling it proof', async () => {
    extractDocumentText.mockRejectedValueOnce(new Error('the file is corrupt'));
    await expect(
      proveWithPdfjs({ bytes: BYTES, pages: [1], needles: [], expectNoText: true })
    ).rejects.toThrow('the file is corrupt');
  });
});

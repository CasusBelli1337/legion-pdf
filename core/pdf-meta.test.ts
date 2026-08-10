import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { assertPageInRange, countPages, EmptyDocumentError } from './pdf-meta';

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([612, 792]);
  return doc.save();
}

describe('countPages', () => {
  it('counts the pages of a generated document', async () => {
    expect(await countPages(await makePdf(1))).toBe(1);
    expect(await countPages(await makePdf(7))).toBe(7);
  });

  it('throws loudly on empty bytes instead of reporting a 0-page success', async () => {
    await expect(countPages(new Uint8Array(0))).rejects.toBeInstanceOf(EmptyDocumentError);
  });

  it('throws on bytes that are not a PDF', async () => {
    await expect(countPages(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});

describe('assertPageInRange', () => {
  it('accepts every valid 1-based page', () => {
    expect(() => assertPageInRange(1, 3)).not.toThrow();
    expect(() => assertPageInRange(3, 3)).not.toThrow();
  });

  it('rejects out-of-range, zero, negative, and fractional pages', () => {
    expect(() => assertPageInRange(4, 3)).toThrow(RangeError);
    expect(() => assertPageInRange(0, 3)).toThrow(RangeError);
    expect(() => assertPageInRange(-1, 3)).toThrow(RangeError);
    expect(() => assertPageInRange(1.5, 3)).toThrow(RangeError);
  });

  it('names the offending index in the message', () => {
    expect(() => assertPageInRange(9, 3, 'insert position')).toThrow(/insert position 9/);
  });
});

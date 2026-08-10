import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ContentStreamError, detectTextLayer } from './text-detect';
import { writeTextLayer } from './text-layer';
import type { OcrPageWords } from './types';

/** Page 1 is born-digital, page 2 is a "scan" (drawing only), page 3 a folio. */
async function mixedDocument(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const text = document.addPage([612, 792]);
  text.drawText('IN THE SUPERIOR COURT OF THE STATE OF CALIFORNIA', {
    x: 72,
    y: 700,
    size: 12,
    font,
  });
  const scanned = document.addPage([612, 792]);
  scanned.drawRectangle({ x: 40, y: 40, width: 532, height: 712, color: rgb(0.9, 0.9, 0.9) });
  const folio = document.addPage([612, 792]);
  folio.drawText('14', { x: 300, y: 40, size: 10, font });
  return document.save();
}

describe('detectTextLayer', () => {
  it('separates born-digital pages from pages that are only pictures', async () => {
    const result = await detectTextLayer(await mixedDocument());
    expect(result.pageCount).toBe(3);
    expect(result.pagesWithText).toEqual([1]);
    expect(result.pagesNeedingOcr).toEqual([2, 3]);
  });

  it('accounts for every page exactly once', async () => {
    const result = await detectTextLayer(await mixedDocument());
    const seen = [...result.pagesWithText, ...result.pagesNeedingOcr].sort((a, b) => a - b);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('treats a lone stamped page number as a page still needing OCR', async () => {
    const result = await detectTextLayer(await mixedDocument());
    expect(result.pagesNeedingOcr).toContain(3);
  });

  it('honours a caller-supplied character threshold', async () => {
    const result = await detectTextLayer(await mixedDocument(), 2);
    expect(result.pagesWithText).toEqual([1, 3]);
    expect(result.pagesNeedingOcr).toEqual([2]);
  });

  /** The round trip that proves a run actually landed: detect, OCR, detect again. */
  it('sees the invisible layer a run just wrote', async () => {
    const before = await detectTextLayer(await mixedDocument());
    expect(before.pagesNeedingOcr).toContain(2);

    const recognized: OcrPageWords = {
      page: 2,
      widthPx: 2550,
      heightPx: 3300,
      blank: false,
      words: 'THIS PAGE WAS A SCAN UNTIL NOW'.split(' ').map((text, index) => ({
        text,
        box: { x0: 300 + index * 220, y0: 700, x1: 300 + index * 220 + 200, y1: 760 },
        confidence: 90,
      })),
    };
    const written = await writeTextLayer(await mixedDocument(), [recognized]);

    const after = await detectTextLayer(written.bytes);
    expect(after.pagesWithText).toContain(2);
    expect(after.pagesNeedingOcr).not.toContain(2);
  });

  it('refuses an empty byte array rather than reporting zero pages', async () => {
    await expect(detectTextLayer(new Uint8Array())).rejects.toBeInstanceOf(ContentStreamError);
  });
});

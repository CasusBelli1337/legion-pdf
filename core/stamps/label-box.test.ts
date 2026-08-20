import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import { measureInk } from './ink';
import { LABEL_PADDING, measureLabel } from './label-box';

/** Helvetica-Bold's ascender and descender, as thousandths of the em. */
const ASCENT = 0.718;
const DESCENT = 0.207;
const SIZES = [10, 14, 24, 40, 65];

async function stampFont(): Promise<PDFFont> {
  const document = await PDFDocument.create({ updateMetadata: false });
  return document.embedFont(StandardFonts.HelveticaBold);
}

describe('measureInk', () => {
  it('boxes an all-caps label on its cap band, with the baseline on the floor', async () => {
    const font = await stampFont();
    for (const size of SIZES) {
      const ink = measureInk(font, 'EXHIBIT A', size);
      expect(ink.height).toBeCloseTo(ASCENT * size, 6);
      expect(ink.baseline).toBe(0);
    }
  });

  it('numbers and mixed case without descenders measure the same band', async () => {
    const font = await stampFont();
    for (const text of ['EXHIBIT 12', 'Exhibit A', 'PLAINTIFF 000123']) {
      expect(measureInk(font, text, 65).height).toBeCloseTo(ASCENT * 65, 6);
    }
  });

  // The whole point: the old measurement reserved the descent under every
  // label, so a bordered EXHIBIT A carried 13.5pt of empty paper under it at
  // 65pt and 8pt over it. That gap is what the owner saw.
  it('is shorter than the font line box by exactly the unused descent', async () => {
    const font = await stampFont();
    const lineBox = font.heightAtSize(65);
    expect(lineBox - measureInk(font, 'EXHIBIT A', 65).height).toBeCloseTo(DESCENT * 65, 6);
  });

  it('reserves the descent only when a glyph actually uses it', async () => {
    const font = await stampFont();
    const ink = measureInk(font, 'Exhibit page 12', 65);
    expect(ink.baseline).toBeCloseTo(DESCENT * 65, 6);
    expect(ink.height).toBeCloseTo((ASCENT + DESCENT) * 65, 6);
  });
});

describe('measureLabel', () => {
  it('grows the ink band by the same padding on every side', async () => {
    const font = await stampFont();
    for (const size of SIZES) {
      const { ink, box } = measureLabel(font, 'EXHIBIT A', size, true);
      expect(box.width - ink.width).toBeCloseTo(2 * LABEL_PADDING, 6);
      expect(box.height - ink.height).toBeCloseTo(2 * LABEL_PADDING, 6);
    }
  });

  it('leaves the ink band alone when there is no border to centre', async () => {
    const font = await stampFont();
    const { ink, box } = measureLabel(font, 'EXHIBIT A', 65, false);
    expect(box).toEqual({ width: ink.width, height: ink.height });
  });

  /**
   * The centring claim, stated as arithmetic: with the box drawn at (0,0), the
   * clear space over the caps and under the baseline are both the padding.
   */
  it('centres the label in its box at every size, 65pt included', async () => {
    const font = await stampFont();
    for (const size of SIZES) {
      const { ink, box } = measureLabel(font, 'EXHIBIT A', size, true);
      const baseline = LABEL_PADDING + ink.baseline;
      const overCaps = box.height - (baseline + ASCENT * size);
      const underBaseline = baseline - ink.baseline;
      expect(overCaps).toBeCloseTo(LABEL_PADDING, 6);
      expect(underBaseline).toBeCloseTo(LABEL_PADDING, 6);
      expect(overCaps).toBeCloseTo(underBaseline, 6);
    }
  });

  it('keeps a descender inside the box rather than under its border', async () => {
    const font = await stampFont();
    const { ink, box } = measureLabel(font, 'Exhibit gy', 65, true);
    const descenderFloor = LABEL_PADDING + ink.baseline - DESCENT * 65;
    expect(descenderFloor).toBeCloseTo(LABEL_PADDING, 6);
    expect(box.height).toBeCloseTo((ASCENT + DESCENT) * 65 + 2 * LABEL_PADDING, 6);
  });
});

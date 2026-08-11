import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import { RangeCollapseError } from '@shared/types';
import type { WatermarkOptions } from '@shared/types';
import { containsText, makeTestPdf } from '../ops/test-fixtures';
import { frameOf, toVisualSpace } from './geometry';
import { applyWatermark } from './watermark';
import { angleOf, place, textMarksOnPage } from './stamp-testkit';

/** The same metrics the watermark laid its text out with. */
async function helveticaBold(): Promise<PDFFont> {
  const document = await PDFDocument.create({ updateMetadata: false });
  return document.embedFont(StandardFonts.HelveticaBold);
}

const PAGE = { width: 612, height: 792 };

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    ...PAGE,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

function options(overrides: Partial<WatermarkOptions> = {}): WatermarkOptions {
  return {
    text: 'CONFIDENTIAL',
    pages: [1],
    orientation: 'diagonal',
    opacity: 0.2,
    fontSize: 60,
    color: '#808080',
    ...overrides,
  };
}

/** The `ca` alpha values a page's /ExtGState resources declare. */
async function alphaValues(bytes: Uint8Array, page: number): Promise<number[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const resources = document.getPage(page - 1).node.Resources();
  const states = resources?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
  return (states?.keys() ?? []).map((key) => {
    const state = states?.lookupMaybe(key, PDFDict);
    const alpha = state?.get(PDFName.of('ca'));
    return Number(alpha?.toString() ?? NaN);
  });
}

describe('applyWatermark', () => {
  it('marks every page in the range and leaves the others clean', async () => {
    const bytes = await makeTestPdf({ pages: pages(4) });
    const result = await applyWatermark(bytes, options({ pages: [1, 3] }));

    expect(result.pagesOut).toBe(4);
    expect(containsText(result.bytes, 'CONFIDENTIAL')).toBe(true);
    expect((await textMarksOnPage(result.bytes, 1)).map((m) => m.text)).toContain('CONFIDENTIAL');
    expect((await textMarksOnPage(result.bytes, 2)).map((m) => m.text)).toEqual(['PAGE-2']);
    expect((await textMarksOnPage(result.bytes, 3)).map((m) => m.text)).toContain('CONFIDENTIAL');
  });

  it('sets transparency through a real graphics state, not a pale colour', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await applyWatermark(bytes, options({ opacity: 0.15 }));
    expect(await alphaValues(result.bytes, 1)).toContain(0.15);
  });

  it('runs a diagonal watermark at 45 degrees and a horizontal one level', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const diagonal = await applyWatermark(bytes, options({ orientation: 'diagonal' }));
    const horizontal = await applyWatermark(bytes, options({ orientation: 'horizontal' }));

    const spun = (await textMarksOnPage(diagonal.bytes, 1)).find((m) => m.text === 'CONFIDENTIAL');
    const level = (await textMarksOnPage(horizontal.bytes, 1)).find(
      (m) => m.text === 'CONFIDENTIAL'
    );
    expect(angleOf(spun?.matrix ?? [1, 0, 0, 1, 0, 0])).toBe(45);
    expect(angleOf(level?.matrix ?? [1, 0, 0, 1, 0, 0])).toBe(0);
  });

  it('centres the text on the page whatever its rotation', async () => {
    const font = await helveticaBold();
    const width = font.widthOfTextAtSize('CONFIDENTIAL', 40);
    const lift = font.heightAtSize(40) - font.heightAtSize(40, { descender: false });
    const boxHeight = font.heightAtSize(40);

    for (const rotation of [0, 90, 180, 270]) {
      const bytes = await makeTestPdf({ pages: pages(1, rotation) });
      const result = await applyWatermark(
        bytes,
        options({ orientation: 'horizontal', fontSize: 40 })
      );
      const mark = (await textMarksOnPage(result.bytes, 1)).find((m) => m.text === 'CONFIDENTIAL');
      const matrix = mark?.matrix ?? [1, 0, 0, 1, 0, 0];
      const frame = frameOf(PAGE, rotation);
      const start = toVisualSpace(frame, place(matrix, { x: 0, y: 0 }));
      const end = toVisualSpace(frame, place(matrix, { x: width, y: 0 }));

      expect((start.x + end.x) / 2).toBeCloseTo(frame.visual.width / 2, 6);
      expect(start.y).toBeCloseTo(frame.visual.height / 2 - boxHeight / 2 + lift, 6);
    }
  });

  it('adds the page rotation on top of the watermark angle', async () => {
    const bytes = await makeTestPdf({ pages: pages(1, 90) });
    const result = await applyWatermark(bytes, options({ orientation: 'diagonal' }));
    const mark = (await textMarksOnPage(result.bytes, 1)).find((m) => m.text === 'CONFIDENTIAL');
    expect(angleOf(mark?.matrix ?? [1, 0, 0, 1, 0, 0])).toBe(135);
  });

  describe('refusals', () => {
    it('throws RangeCollapseError on an empty page selection', async () => {
      const bytes = await makeTestPdf({ pages: pages(2) });
      await expect(applyWatermark(bytes, options({ pages: [] }))).rejects.toBeInstanceOf(
        RangeCollapseError
      );
    });

    it('refuses an invisible or opaque strength and a bad colour', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(applyWatermark(bytes, options({ opacity: 0 }))).rejects.toThrow(/strength/);
      await expect(applyWatermark(bytes, options({ opacity: 2 }))).rejects.toThrow(/strength/);
      await expect(applyWatermark(bytes, options({ color: 'grey' }))).rejects.toThrow(/#RRGGBB/);
    });
  });
});

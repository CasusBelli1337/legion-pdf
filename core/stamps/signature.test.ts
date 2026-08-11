import { describe, expect, it } from 'vitest';
import { makePng } from '../ocr/png-fixture.testkit';
import { annotationCounts, makeTestPdf, pageXObjectNames } from '../ops/test-fixtures';
import { frameOf, toUserSpace } from './geometry';
import { placeSignature } from './signature';
import { angleOf, marksOnPage, place, textMarksOnPage } from './stamp-testkit';

const PAGE = { width: 612, height: 792 };

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    ...PAGE,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

/** A transparent-background signature scribble. */
function signaturePng(width = 240, height = 80): Uint8Array {
  return makePng({
    width,
    height,
    channels: 4,
    paint: (x, y) =>
      Math.abs(y - height / 2) < 6 + 4 * Math.sin(x / 8) ? [0, 0, 0, 255] : [0, 0, 0, 0],
  });
}

describe('placeSignature', () => {
  it('embeds the image and leaves no annotation behind', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const result = await placeSignature(bytes, {
      page: 1,
      png: signaturePng(),
      at: { x: 100, y: 120 },
      widthPt: 180,
      heightPt: 60,
    });

    expect(result.pagesIn).toBe(2);
    expect(result.pagesOut).toBe(2);
    expect(await annotationCounts(result.bytes)).toEqual([0, 0]);
    expect(await pageXObjectNames(result.bytes, 1)).not.toHaveLength(0);
    const images = (await marksOnPage(result.bytes, 1)).filter((m) => m.kind === 'image');
    expect(images).toHaveLength(1);
  });

  it('lands at the requested rectangle in PDF space', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await placeSignature(bytes, {
      page: 1,
      png: signaturePng(),
      at: { x: 100, y: 120 },
      widthPt: 180,
      heightPt: 60,
    });

    const image = (await marksOnPage(result.bytes, 1)).find((m) => m.kind === 'image');
    const matrix = image?.matrix ?? [1, 0, 0, 1, 0, 0];
    const origin = place(matrix, { x: 0, y: 0 });
    const opposite = place(matrix, { x: 1, y: 1 });
    expect(origin.x).toBeCloseTo(100, 6);
    expect(origin.y).toBeCloseTo(120, 6);
    expect(opposite.x).toBeCloseTo(280, 6);
    expect(opposite.y).toBeCloseTo(180, 6);
  });

  it('stands the signature upright on a rotated page', async () => {
    for (const rotation of [90, 180, 270]) {
      const frame = frameOf(PAGE, rotation);
      const bytes = await makeTestPdf({ pages: pages(1, rotation) });
      const at = toUserSpace(frame, { x: 50, y: 60 });
      const result = await placeSignature(bytes, {
        page: 1,
        png: signaturePng(),
        at,
        widthPt: 180,
        heightPt: 60,
      });

      const image = (await marksOnPage(result.bytes, 1)).find((m) => m.kind === 'image');
      const matrix = image?.matrix ?? [1, 0, 0, 1, 0, 0];
      expect(angleOf(matrix)).toBe(rotation);
      expect(place(matrix, { x: 0, y: 0 }).x).toBeCloseTo(at.x, 6);
      expect(place(matrix, { x: 0, y: 0 }).y).toBeCloseTo(at.y, 6);
    }
  });

  it('stamps the date beside the signature only when asked', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const plain = await placeSignature(bytes, {
      page: 1,
      png: signaturePng(),
      at: { x: 100, y: 120 },
      widthPt: 180,
      heightPt: 60,
    });
    const dated = await placeSignature(bytes, {
      page: 1,
      png: signaturePng(),
      at: { x: 100, y: 120 },
      widthPt: 180,
      heightPt: 60,
      dateText: '08/10/2026',
    });

    expect((await textMarksOnPage(plain.bytes, 1)).map((m) => m.text)).not.toContain('08/10/2026');
    const dateMark = (await textMarksOnPage(dated.bytes, 1)).find((m) => m.text === '08/10/2026');
    expect(dateMark).toBeDefined();
    expect(place(dateMark?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 }).x).toBeGreaterThan(280);
  });

  describe('refusals', () => {
    it('refuses anything that is not a PNG', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(
        placeSignature(bytes, {
          page: 1,
          png: new Uint8Array(64),
          at: { x: 0, y: 0 },
          widthPt: 100,
          heightPt: 40,
        })
      ).rejects.toThrow(/not a PNG/);
    });

    it('refuses a page the document does not have', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(
        placeSignature(bytes, {
          page: 4,
          png: signaturePng(),
          at: { x: 0, y: 0 },
          widthPt: 100,
          heightPt: 40,
        })
      ).rejects.toThrow(/pages 1 through 1/);
    });

    it('refuses a signature squashed to nothing', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(
        placeSignature(bytes, {
          page: 1,
          png: signaturePng(),
          at: { x: 0, y: 0 },
          widthPt: 1,
          heightPt: 1,
        })
      ).rejects.toThrow(/between 4 and 2000 points/);
    });
  });
});

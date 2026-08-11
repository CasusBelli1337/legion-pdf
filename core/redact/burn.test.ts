import { describe, expect, it } from 'vitest';
import { makePng } from '@core/ocr/png-fixture.testkit';
import { burnRects } from './burn';
import { pixelAt } from './raster.testkit';
import { RedactionGeometryError } from './types';

const WHITE_PAGE = makePng({
  width: 40,
  height: 30,
  channels: 4,
  paint: () => [255, 255, 255, 255],
});

describe('burnRects', () => {
  it('replaces the marked pixels with opaque black', () => {
    const burn = burnRects(WHITE_PAGE, [{ x: 5, y: 5, width: 10, height: 10 }]);
    expect(pixelAt(burn.png, 5, 5)).toEqual([0, 0, 0]);
    expect(pixelAt(burn.png, 14, 14)).toEqual([0, 0, 0]);
  });

  it('leaves everything outside the mark alone', () => {
    const burn = burnRects(WHITE_PAGE, [{ x: 5, y: 5, width: 10, height: 10 }]);
    expect(pixelAt(burn.png, 4, 5)).toEqual([255, 255, 255]);
    expect(pixelAt(burn.png, 15, 15)).toEqual([255, 255, 255]);
    expect(pixelAt(burn.png, 39, 29)).toEqual([255, 255, 255]);
  });

  it('counts the pixels it destroyed', () => {
    const burn = burnRects(WHITE_PAGE, [{ x: 0, y: 0, width: 4, height: 3 }]);
    expect(burn.paintedPixels).toBe(12);
  });

  it('burns several marks on one page', () => {
    const burn = burnRects(WHITE_PAGE, [
      { x: 0, y: 0, width: 2, height: 2 },
      { x: 30, y: 20, width: 2, height: 2 },
    ]);
    expect(burn.paintedPixels).toBe(8);
    expect(pixelAt(burn.png, 31, 21)).toEqual([0, 0, 0]);
  });

  it('flattens transparency, so a "black" mark can never be see-through', () => {
    const transparent = makePng({ width: 4, height: 4, channels: 4, paint: () => [0, 0, 0, 0] });
    const burn = burnRects(transparent, [{ x: 0, y: 0, width: 1, height: 1 }]);
    expect(pixelAt(burn.png, 1, 1)).toEqual([255, 255, 255]);
    expect(pixelAt(burn.png, 0, 0)).toEqual([0, 0, 0]);
  });

  it('reports the raster size it burned', () => {
    const burn = burnRects(WHITE_PAGE, [{ x: 1, y: 1, width: 1, height: 1 }]);
    expect(burn).toMatchObject({ widthPx: 40, heightPx: 30 });
  });

  it('refuses a page scheduled for redaction with no marks', () => {
    expect(() => burnRects(WHITE_PAGE, [])).toThrow(RedactionGeometryError);
  });

  it('refuses to report a burn that painted nothing', () => {
    expect(() => burnRects(WHITE_PAGE, [{ x: 100, y: 100, width: 5, height: 5 }])).toThrow(
      /destroyed nothing/
    );
  });
});

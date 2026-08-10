import { describe, expect, it } from 'vitest';
import { assertRasterPage, canvasSizeFor, dpiToScale } from './raster-geometry';

describe('dpiToScale', () => {
  it('maps DPI onto the 72-units-per-inch PDF user space', () => {
    expect(dpiToScale(72)).toBe(1);
    expect(dpiToScale(144)).toBe(2);
    expect(dpiToScale(300)).toBeCloseTo(4.1667, 4);
  });

  it('rejects a non-positive or non-finite DPI', () => {
    expect(() => dpiToScale(0)).toThrow(RangeError);
    expect(() => dpiToScale(-300)).toThrow(RangeError);
    expect(() => dpiToScale(Number.NaN)).toThrow(RangeError);
    expect(() => dpiToScale(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('assertRasterPage', () => {
  it('accepts pages inside the document', () => {
    expect(() => assertRasterPage(1, 10)).not.toThrow();
    expect(() => assertRasterPage(10, 10)).not.toThrow();
  });

  it('rejects a window that would collapse to nothing', () => {
    expect(() => assertRasterPage(11, 10)).toThrow(/pages 1 through 10/);
    expect(() => assertRasterPage(0, 10)).toThrow(RangeError);
    expect(() => assertRasterPage(2.5, 10)).toThrow(RangeError);
  });
});

describe('canvasSizeFor', () => {
  it('rounds up so no content is clipped', () => {
    expect(canvasSizeFor(612.3, 791.2)).toEqual({ widthPx: 613, heightPx: 792 });
  });

  it('never produces a zero-pixel canvas', () => {
    expect(canvasSizeFor(0, 0)).toEqual({ widthPx: 1, heightPx: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import type { PdfRect } from '@shared/types';
import {
  applyMatrix,
  displaySize,
  displayToUserMatrix,
  normalizeRotation,
  pointsPerPixel,
  rasterScale,
  wordRect,
} from './geometry';

const LETTER: PdfRect = { x: 0, y: 0, width: 612, height: 792 };

describe('pointsPerPixel', () => {
  it('turns 300 DPI into 0.24 points per pixel', () => {
    expect(pointsPerPixel(300)).toBeCloseTo(0.24, 10);
  });

  it('is the identity at 72 DPI', () => {
    expect(pointsPerPixel(72)).toBe(1);
  });

  it('refuses a DPI that cannot rasterize anything', () => {
    expect(() => pointsPerPixel(0)).toThrow(RangeError);
    expect(() => pointsPerPixel(Number.NaN)).toThrow(RangeError);
  });
});

describe('normalizeRotation', () => {
  it('folds negative and oversized /Rotate values onto 0/90/180/270', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(180)).toBe(180);
  });
});

describe('displaySize', () => {
  it('swaps the axes for a quarter-turned page', () => {
    expect(displaySize(0, LETTER)).toEqual({ width: 612, height: 792 });
    expect(displaySize(90, LETTER)).toEqual({ width: 792, height: 612 });
    expect(displaySize(180, LETTER)).toEqual({ width: 612, height: 792 });
    expect(displaySize(270, LETTER)).toEqual({ width: 792, height: 612 });
  });
});

describe('displayToUserMatrix', () => {
  it('is the identity on an unrotated page at the origin', () => {
    expect(displayToUserMatrix(0, LETTER)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('shifts by the crop box origin', () => {
    const crop: PdfRect = { x: 20, y: 30, width: 572, height: 732 };
    const point = applyMatrix(displayToUserMatrix(0, crop), 0, 0);
    expect(point).toEqual({ x: 20, y: 30 });
  });

  /**
   * /Rotate turns the page CLOCKWISE when displayed. Turning a portrait page
   * 90° clockwise carries its bottom-left corner up to the displayed top-left;
   * 180° carries the bottom-right there; 270° the top-right.
   */
  it.each([
    [0, { x: 0, y: 792 }],
    [90, { x: 0, y: 0 }],
    [180, { x: 612, y: 0 }],
    [270, { x: 612, y: 792 }],
  ])('maps the displayed top-left corner for /Rotate %i', (rotation, expected) => {
    const size = displaySize(rotation, LETTER);
    const mapped = applyMatrix(displayToUserMatrix(rotation, LETTER), 0, size.height);
    expect(mapped.x).toBeCloseTo(expected.x, 6);
    expect(mapped.y).toBeCloseTo(expected.y, 6);
  });

  it('keeps every displayed corner inside the page for every rotation', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const size = displaySize(rotation, LETTER);
      const corners = [
        [0, 0],
        [size.width, 0],
        [0, size.height],
        [size.width, size.height],
      ] as const;
      for (const [x, y] of corners) {
        const point = applyMatrix(displayToUserMatrix(rotation, LETTER), x, y);
        expect(point.x).toBeGreaterThanOrEqual(-1e-9);
        expect(point.x).toBeLessThanOrEqual(612 + 1e-9);
        expect(point.y).toBeGreaterThanOrEqual(-1e-9);
        expect(point.y).toBeLessThanOrEqual(792 + 1e-9);
      }
    }
  });
});

describe('rasterScale', () => {
  it('derives points-per-pixel from the raster we actually received', () => {
    const scale = rasterScale({ width: 612, height: 792 }, 2550, 3300);
    expect(scale.scaleX).toBeCloseTo(0.24, 10);
    expect(scale.scaleY).toBeCloseTo(0.24, 10);
  });

  it('throws on a raster with no area instead of dividing by zero', () => {
    expect(() => rasterScale({ width: 612, height: 792 }, 0, 3300)).toThrow(RangeError);
  });
});

describe('wordRect', () => {
  const display = { width: 612, height: 792 };
  const scale = rasterScale(display, 2550, 3300);

  it('flips the hOCR top-left origin onto PDF bottom-left space', () => {
    // Real Tesseract box for "SUPERIOR" on a 2550x3300 raster.
    const rect = wordRect(
      { x0: 306, y0: 328, x1: 702, y1: 384 },
      scale.scaleX,
      scale.scaleY,
      display
    );
    expect(rect.x).toBeCloseTo(73.44, 6);
    expect(rect.width).toBeCloseTo(95.04, 6);
    expect(rect.height).toBeCloseTo(13.44, 6);
    // y0=328px from the top → 792 - 384*0.24 = 699.84pt for the baseline edge.
    expect(rect.y).toBeCloseTo(699.84, 6);
  });

  it('puts a box at the top of the raster near the top of the page', () => {
    const rect = wordRect({ x0: 0, y0: 0, x1: 100, y1: 50 }, scale.scaleX, scale.scaleY, display);
    expect(rect.y + rect.height).toBeCloseTo(792, 6);
  });

  it('puts a box at the bottom of the raster near y = 0', () => {
    const rect = wordRect(
      { x0: 0, y0: 3250, x1: 100, y1: 3300 },
      scale.scaleX,
      scale.scaleY,
      display
    );
    expect(rect.y).toBeCloseTo(0, 6);
  });
});

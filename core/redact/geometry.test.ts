import { describe, expect, it } from 'vitest';
import {
  assertRasterMatchesPage,
  displayRectToPixels,
  imagePlacement,
  pdfRectToPixels,
  userRectToDisplay,
} from './geometry';
import { RedactionGeometryError } from './types';

const LETTER = { x: 0, y: 0, width: 612, height: 792 };
/** A mark near the bottom-left of the unrotated page. */
const MARK = { x: 72, y: 100, width: 200, height: 20 };

describe('userRectToDisplay', () => {
  it('leaves an unrotated page alone', () => {
    expect(userRectToDisplay(MARK, 0, LETTER)).toEqual(MARK);
  });

  it('turns the mark with a /Rotate 90 page', () => {
    // Displayed 90 CW: the page is 792 wide, and x becomes distance from the top.
    expect(userRectToDisplay(MARK, 90, LETTER)).toEqual({
      x: 100,
      y: 612 - 72 - 200,
      width: 20,
      height: 200,
    });
  });

  it('mirrors both axes at /Rotate 180', () => {
    expect(userRectToDisplay(MARK, 180, LETTER)).toEqual({
      x: 612 - 72 - 200,
      y: 792 - 100 - 20,
      width: 200,
      height: 20,
    });
  });

  it('turns the mark the other way at /Rotate 270', () => {
    expect(userRectToDisplay(MARK, 270, LETTER)).toEqual({
      x: 792 - 100 - 20,
      y: 72,
      width: 20,
      height: 200,
    });
  });

  it('subtracts a crop box that does not start at the origin', () => {
    const crop = { x: 10, y: 20, width: 592, height: 752 };
    expect(userRectToDisplay(MARK, 0, crop)).toEqual({ x: 62, y: 80, width: 200, height: 20 });
  });

  it('round-trips every rotation back to the same area', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const display = userRectToDisplay(MARK, rotation, LETTER);
      expect(display.width * display.height).toBeCloseTo(MARK.width * MARK.height, 6);
    }
  });
});

describe('displayRectToPixels', () => {
  const display = { width: 612, height: 792 };

  it('scales points to pixels with a top-left origin', () => {
    const rect = displayRectToPixels({ x: 72, y: 692, width: 144, height: 100 }, display, 612, 792);
    expect(rect).toEqual({ x: 72, y: 0, width: 144, height: 100 });
  });

  it('rounds OUTWARD so a mark never under-covers by a fraction of a pixel', () => {
    const rect = displayRectToPixels(
      { x: 10.4, y: 10.4, width: 5.2, height: 5.2 },
      display,
      612,
      792
    );
    expect(rect.x).toBe(10);
    expect(rect.x + rect.width).toBe(16);
  });

  it('scales up at 300 DPI', () => {
    const rect = displayRectToPixels({ x: 72, y: 72, width: 72, height: 72 }, display, 2550, 3300);
    expect(rect.x).toBe(300);
    expect(rect.width).toBe(300);
  });

  it('refuses a mark that falls off the page', () => {
    expect(() =>
      displayRectToPixels({ x: 900, y: 900, width: 10, height: 10 }, display, 612, 792)
    ).toThrow(RedactionGeometryError);
  });

  it('clamps a mark that hangs off the edge instead of dropping it', () => {
    const rect = displayRectToPixels({ x: -20, y: 700, width: 60, height: 200 }, display, 612, 792);
    expect(rect.x).toBe(0);
    expect(rect.width).toBe(40);
    expect(rect.y).toBe(0);
  });
});

describe('pdfRectToPixels', () => {
  it('maps a mark onto an unrotated 300 DPI raster', () => {
    const rect = pdfRectToPixels({ x: 72, y: 720, width: 72, height: 72 }, 0, LETTER, 2550, 3300);
    expect(rect).toEqual({ x: 300, y: 0, width: 300, height: 300 });
  });

  it('lands the same mark in the turned place on a /Rotate 90 page', () => {
    // Raster of a rotated letter page is landscape: 3300 x 2550.
    const rect = pdfRectToPixels({ x: 72, y: 720, width: 72, height: 72 }, 90, LETTER, 3300, 2550);
    expect(rect).toEqual({ x: 3000, y: 300, width: 300, height: 300 });
  });

  it('lands it mirrored on a /Rotate 180 page', () => {
    const rect = pdfRectToPixels({ x: 72, y: 720, width: 72, height: 72 }, 180, LETTER, 2550, 3300);
    expect(rect).toEqual({ x: 1950, y: 3000, width: 300, height: 300 });
  });

  it('lands it turned the other way on a /Rotate 270 page', () => {
    const rect = pdfRectToPixels({ x: 72, y: 720, width: 72, height: 72 }, 270, LETTER, 3300, 2550);
    expect(rect).toEqual({ x: 0, y: 1950, width: 300, height: 300 });
  });

  it('normalizes a /Rotate written as -90', () => {
    expect(
      pdfRectToPixels({ x: 72, y: 720, width: 72, height: 72 }, -90, LETTER, 3300, 2550)
    ).toEqual(pdfRectToPixels({ x: 72, y: 720, width: 72, height: 72 }, 270, LETTER, 3300, 2550));
  });

  it('refuses a mark with no area', () => {
    expect(() =>
      pdfRectToPixels({ x: 10, y: 10, width: 0, height: 5 }, 0, LETTER, 612, 792)
    ).toThrow(RedactionGeometryError);
  });
});

describe('imagePlacement', () => {
  it('covers the page at /Rotate 0', () => {
    expect(imagePlacement(0, LETTER)).toEqual({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      rotate: 0,
    });
  });

  it('anchors at the far corner and pre-turns for /Rotate 90', () => {
    expect(imagePlacement(90, LETTER)).toEqual({
      x: 612,
      y: 0,
      width: 792,
      height: 612,
      rotate: 90,
    });
  });

  it('anchors at the opposite corner for /Rotate 180', () => {
    expect(imagePlacement(180, LETTER)).toEqual({
      x: 612,
      y: 792,
      width: 612,
      height: 792,
      rotate: 180,
    });
  });

  it('anchors at the top-left for /Rotate 270', () => {
    expect(imagePlacement(270, LETTER)).toEqual({
      x: 0,
      y: 792,
      width: 792,
      height: 612,
      rotate: 270,
    });
  });

  it('shifts by a crop box origin', () => {
    const placement = imagePlacement(0, { x: 5, y: 7, width: 100, height: 200 });
    expect(placement).toEqual({ x: 5, y: 7, width: 100, height: 200, rotate: 0 });
  });
});

describe('assertRasterMatchesPage', () => {
  it('accepts a raster of the right shape', () => {
    expect(assertRasterMatchesPage(1, 0, LETTER, 2550, 3300)).toEqual({ width: 612, height: 792 });
  });

  it('accepts a landscape raster for a rotated page', () => {
    expect(assertRasterMatchesPage(1, 90, LETTER, 3300, 2550)).toEqual({ width: 792, height: 612 });
  });

  it('refuses a raster of the wrong page', () => {
    expect(() => assertRasterMatchesPage(3, 0, LETTER, 3300, 2550)).toThrow(
      /does not match a 612x792 point page/
    );
  });

  it('refuses an empty raster', () => {
    expect(() => assertRasterMatchesPage(2, 0, LETTER, 0, 0)).toThrow(RedactionGeometryError);
  });
});

import { describe, expect, it } from 'vitest';
import {
  WATERMARK_DIAGONAL_DEGREES,
  stampBaselineLift,
  stampTextHeight,
  watermarkAnchor,
  watermarkBaselineMid,
  watermarkSpin,
} from './watermark-placement';

const LETTER = { width: 612, height: 792 };
const CENTRE = { x: 306, y: 396 };

function turn(point: { x: number; y: number }, spin: number) {
  const radians = (spin * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

describe('watermarkSpin', () => {
  it('runs a diagonal watermark at 45 degrees and a level one flat', () => {
    expect(watermarkSpin('diagonal')).toBe(WATERMARK_DIAGONAL_DEGREES);
    expect(watermarkSpin('horizontal')).toBe(0);
  });
});

describe('watermarkAnchor', () => {
  it('centres a level box on the page', () => {
    expect(watermarkAnchor(LETTER, { width: 200, height: 40 }, 0)).toEqual({ x: 206, y: 376 });
  });

  it('keeps a spun box centred on the page centre', () => {
    const box = { width: 200, height: 40 };
    const anchor = watermarkAnchor(LETTER, box, 45);
    const centre = turn({ x: box.width / 2, y: box.height / 2 }, 45);

    expect(anchor.x + centre.x).toBeCloseTo(CENTRE.x, 6);
    expect(anchor.y + centre.y).toBeCloseTo(CENTRE.y, 6);
  });
});

describe('watermarkBaselineMid', () => {
  it('sits below the page centre by half a text box, less the descender', () => {
    const mid = watermarkBaselineMid(LETTER, 60, 0);
    expect(mid.x).toBeCloseTo(CENTRE.x, 6);
    expect(mid.y).toBeCloseTo(CENTRE.y - stampTextHeight(60) / 2 + stampBaselineLift(60), 6);
  });

  it('is the middle of the baseline the anchor implies, at any angle', () => {
    // The preview places by baseline (it has no font to measure text with) and
    // the file places by box corner; a watermark that reads as a double-apply is
    // these two disagreeing, so they are pinned to each other here.
    for (const spin of [0, 45, 90, 137]) {
      const box = { width: 203.28, height: stampTextHeight(60) };
      const anchor = watermarkAnchor(LETTER, box, spin);
      const fromAnchor = turn({ x: box.width / 2, y: stampBaselineLift(60) }, spin);
      const mid = watermarkBaselineMid(LETTER, 60, spin);

      expect(anchor.x + fromAnchor.x).toBeCloseTo(mid.x, 6);
      expect(anchor.y + fromAnchor.y).toBeCloseTo(mid.y, 6);
    }
  });

  it('follows the page it is centred on', () => {
    const wide = watermarkBaselineMid({ width: 1000, height: 500 }, 40, 0);
    expect(wide.x).toBeCloseTo(500, 6);
    expect(wide.y).toBeCloseTo(250 - stampTextHeight(40) / 2 + stampBaselineLift(40), 6);
  });
});

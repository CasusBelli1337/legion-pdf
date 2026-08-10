import { describe, expect, it } from 'vitest';
import type { PageSize } from '@shared/types';
import {
  applyInverseTransform,
  clientToPdfPoint,
  fitPageZoom,
  fitWidthZoom,
  pageBoxAt,
  pdfRectToLocalBox,
  pdfToClientPoint,
  toTransformMatrix,
  type Box,
  type TransformMatrix,
} from './page-geometry';

const LETTER: PageSize = { width: 612, height: 792 };

/** The transform pdfjs builds for an unrotated page at a given scale. */
function unrotated(scale: number, size: PageSize = LETTER): TransformMatrix {
  return [scale, 0, 0, -scale, 0, size.height * scale];
}

/** The transform pdfjs builds for a page rotated 90 degrees clockwise. */
function rotated90(scale: number): TransformMatrix {
  return [0, scale, scale, 0, 0, 0];
}

function rectAt(left: number, top: number, size: PageSize, scale: number): Box {
  return { left, top, width: size.width * scale, height: size.height * scale };
}

describe('toTransformMatrix', () => {
  it('accepts a six-number viewport transform', () => {
    expect(toTransformMatrix([2, 0, 0, -2, 0, 1584])).toEqual([2, 0, 0, -2, 0, 1584]);
  });

  it('rejects a malformed transform loudly instead of silently mis-placing marks', () => {
    expect(() => toTransformMatrix([1, 0, 0, 1])).toThrow(RangeError);
    expect(() => toTransformMatrix([1, 0, 0, 1, 0, Number.NaN])).toThrow(RangeError);
  });
});

describe('coordinate round-tripping', () => {
  const zooms = [0.5, 1, 2.75];
  const clientPoints = [
    { x: 140, y: 96 },
    { x: 401.5, y: 622.25 },
    { x: 140.001, y: 887.9 },
  ];

  it.each(zooms)('client to PDF and back is lossless at %s zoom', (zoom) => {
    const transform = unrotated(zoom);
    const rect = rectAt(120, 64, LETTER, zoom);

    for (const point of clientPoints) {
      const pdf = clientToPdfPoint(transform, rect, point);
      const back = pdfToClientPoint(transform, rect, pdf);
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });

  it.each(zooms)('PDF to client and back is lossless at %s zoom', (zoom) => {
    const transform = unrotated(zoom);
    const rect = rectAt(33, 210, LETTER, zoom);
    const pdfPoints = [
      { x: 0, y: 0 },
      { x: 72, y: 720 },
      { x: 611.9, y: 791.9 },
    ];

    for (const point of pdfPoints) {
      const client = pdfToClientPoint(transform, rect, point);
      const back = clientToPdfPoint(transform, rect, client);
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });

  it('places the PDF origin at the bottom-left corner of the page box', () => {
    const zoom = 2;
    const transform = unrotated(zoom);
    const rect = rectAt(100, 50, LETTER, zoom);

    const bottomLeft = pdfToClientPoint(transform, rect, { x: 0, y: 0 });
    expect(bottomLeft.x).toBeCloseTo(rect.left, 6);
    expect(bottomLeft.y).toBeCloseTo(rect.top + rect.height, 6);

    const topRight = pdfToClientPoint(transform, rect, { x: LETTER.width, y: LETTER.height });
    expect(topRight.x).toBeCloseTo(rect.left + rect.width, 6);
    expect(topRight.y).toBeCloseTo(rect.top, 6);
  });

  it('round-trips on a page rotated 90 degrees', () => {
    const zoom = 1.5;
    const transform = rotated90(zoom);
    const rect = rectAt(0, 0, { width: LETTER.height, height: LETTER.width }, zoom);
    const point = { x: 213, y: 466 };

    const pdf = clientToPdfPoint(transform, rect, point);
    const back = pdfToClientPoint(transform, rect, pdf);
    expect(back.x).toBeCloseTo(point.x, 6);
    expect(back.y).toBeCloseTo(point.y, 6);
  });

  it('refuses to invert a degenerate transform', () => {
    expect(() => applyInverseTransform([0, 0, 0, 0, 0, 0], { x: 1, y: 1 })).toThrow(RangeError);
  });
});

describe('pdfRectToLocalBox', () => {
  it('maps a PDF rectangle to a page-relative CSS box', () => {
    const box = pdfRectToLocalBox(unrotated(2), { x: 72, y: 72, width: 100, height: 20 });
    expect(box).toEqual({ left: 144, top: 1400, width: 200, height: 40 });
  });

  it('keeps width and height positive on a rotated page', () => {
    const box = pdfRectToLocalBox(rotated90(1), { x: 10, y: 10, width: 50, height: 12 });
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});

describe('page box and fit presets', () => {
  it('sizes the page box in CSS pixels at the given zoom', () => {
    expect(pageBoxAt(LETTER, 0.5)).toEqual({ width: 306, height: 396 });
  });

  it('fits the width, minus the gutter', () => {
    expect(fitWidthZoom(1224 + 48, LETTER, 48)).toBeCloseTo(2, 6);
  });

  it('fits a whole page by its tighter dimension', () => {
    expect(fitPageZoom(1272, 792 + 48, LETTER, 48)).toBeCloseTo(1, 6);
  });

  it('falls back to a sane zoom when the container has not been measured yet', () => {
    expect(fitWidthZoom(0, LETTER, 48)).toBe(1);
  });
});

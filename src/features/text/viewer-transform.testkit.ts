/**
 * TEST SUPPORT ONLY — never imported by shipping code.
 *
 * The viewer's own transform, rebuilt exactly as pdfjs builds it, so a test can
 * put a box on screen and take it back off again through the same arithmetic
 * the running app uses. One copy, because two tests now depend on it and a
 * second copy is how they would quietly disagree.
 */

import type { PdfRect } from '@shared/types';
import type { Box, ClientPoint } from '@renderer/components/viewer';

export type Matrix = [number, number, number, number, number, number];

/** `PageViewport.transform` for an upright page at a zoom. */
export function upright(scale: number, pageHeightPt: number): Matrix {
  return [scale, 0, 0, -scale, 0, pageHeightPt * scale];
}

/** `PageViewport.transform` for a page with /Rotate 90. */
export function quarterTurned(scale: number): Matrix {
  return [0, scale, scale, 0, 0, 0];
}

export function applyTransform(transform: Matrix, point: ClientPoint): ClientPoint {
  const [a, b, c, d, e, f] = transform;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

export function applyInverse(transform: Matrix, point: ClientPoint): ClientPoint {
  const [a, b, c, d, e, f] = transform;
  const determinant = a * d - b * c;
  const x = point.x - e;
  const y = point.y - f;
  return { x: (x * d - y * c) / determinant, y: (y * a - x * b) / determinant };
}

/** The viewer's `toLocalBox`, with the page canvas parked at the origin. */
export function localBox(transform: Matrix, rect: PdfRect): Box {
  const first = applyTransform(transform, { x: rect.x, y: rect.y });
  const second = applyTransform(transform, {
    x: rect.x + rect.width,
    y: rect.y + rect.height,
  });
  return {
    left: Math.min(first.x, second.x),
    top: Math.min(first.y, second.y),
    width: Math.abs(second.x - first.x),
    height: Math.abs(second.y - first.y),
  };
}

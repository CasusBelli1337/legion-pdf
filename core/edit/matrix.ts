/**
 * The 2x3 affine matrices a content stream is written in — `cm`, `Tm`, and the
 * text render matrix built from them.
 *
 * Kept apart from core/stamps/geometry.ts on purpose: that file reasons about a
 * PAGE (its media box and its quarter turn), this one about the arithmetic
 * inside a stream. The test-only walker in core/stamps/stamp-testkit.ts carries
 * the same multiply; this is the shipping copy it should be read against.
 */

import type { PdfPoint, PdfRect } from '@shared/types';

/** `[a, b, c, d, e, f]`, exactly as `cm` and `Tm` take it. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `left` applied first, then `right` — the order PDF operators compose in. */
export function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

export function translation(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

/** Where a matrix puts a point. */
export function apply(matrix: Matrix, point: PdfPoint): PdfPoint {
  const [a, b, c, d, e, f] = matrix;
  return { x: point.x * a + point.y * c + e, y: point.x * b + point.y * d + f };
}

/** Six numbers off an operand stack, missing ones read as zero. */
export function matrixFrom(operands: readonly number[]): Matrix {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = operands.slice(-6);
  return [a, b, c, d, e, f];
}

/**
 * The upright box around a set of points. A rotated or skewed glyph has no
 * axis-aligned box of its own, so the box that contains it is what a rectangle
 * comparison can honestly use.
 */
export function boundsOf(points: readonly PdfPoint[]): PdfRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const bottom = Math.min(...ys);
  return { x: left, y: bottom, width: Math.max(...xs) - left, height: Math.max(...ys) - bottom };
}

/** Area shared by two rectangles; zero when they only touch or miss entirely. */
export function overlapArea(first: PdfRect, second: PdfRect): number {
  const width =
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const height =
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  return width <= 0 || height <= 0 ? 0 : width * height;
}

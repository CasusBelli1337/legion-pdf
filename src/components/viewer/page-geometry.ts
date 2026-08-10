/**
 * Pure page geometry: the coordinate bridge between the screen and PDF user
 * space. Kept free of React, pdfjs, and the DOM so every conversion the stamp
 * and redaction lanes depend on is unit-tested in plain Node.
 *
 * The only input from pdfjs is the viewport's affine transform, which maps a
 * PDF point (origin bottom-left, y up) to a CSS pixel inside the page box
 * (origin top-left, y down) at the current zoom.
 */

import type { PageSize, PdfPoint, PdfRect } from '@shared/types';

/** Affine matrix [a, b, c, d, e, f], exactly as `PageViewport.transform`. */
export type TransformMatrix = readonly [number, number, number, number, number, number];

/** A box in CSS pixels. Client rects use viewport coords; local boxes are page-relative. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ClientPoint {
  x: number;
  y: number;
}

/** Everything the viewer knows about one rendered page. */
export interface PageGeometry {
  /** Page size in PDF points, page rotation applied. */
  size: PageSize;
  /** CSS pixels per PDF point at the zoom this page was rendered at. */
  scale: number;
  /** PDF user space to CSS pixels inside the page box. */
  transform: TransformMatrix;
  /** The mounted page element; rects are read fresh from it, never cached. */
  element: HTMLElement | null;
}

/** Reads a viewport transform into our tuple, failing loudly on a malformed one. */
export function toTransformMatrix(values: readonly number[]): TransformMatrix {
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`A page transform needs six finite numbers, got [${values.join(', ')}].`);
  }
  const [a, b, c, d, e, f] = values as [number, number, number, number, number, number];
  return [a, b, c, d, e, f];
}

export function applyTransform(transform: TransformMatrix, point: ClientPoint): ClientPoint {
  const [a, b, c, d, e, f] = transform;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

export function applyInverseTransform(transform: TransformMatrix, point: ClientPoint): ClientPoint {
  const [a, b, c, d, e, f] = transform;
  const determinant = a * d - b * c;
  if (determinant === 0) {
    throw new RangeError('This page transform cannot be inverted; its determinant is zero.');
  }
  const x = point.x - e;
  const y = point.y - f;
  return { x: (x * d - y * c) / determinant, y: (y * a - x * b) / determinant };
}

/** Viewport (client) coordinates to PDF points, given the page's current rect. */
export function clientToPdfPoint(
  transform: TransformMatrix,
  rect: Box,
  point: ClientPoint
): PdfPoint {
  return applyInverseTransform(transform, {
    x: point.x - rect.left,
    y: point.y - rect.top,
  });
}

/** PDF points to viewport (client) coordinates, given the page's current rect. */
export function pdfToClientPoint(
  transform: TransformMatrix,
  rect: Box,
  point: PdfPoint
): ClientPoint {
  const local = applyTransform(transform, point);
  return { x: local.x + rect.left, y: local.y + rect.top };
}

/**
 * A PDF-space rectangle as a CSS box relative to the page element — what an
 * overlay child needs for `position: absolute`. Both PDF corners are mapped so
 * the result stays correct on rotated pages.
 */
export function pdfRectToLocalBox(transform: TransformMatrix, rect: PdfRect): Box {
  const first = applyTransform(transform, { x: rect.x, y: rect.y });
  const second = applyTransform(transform, { x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    left: Math.min(first.x, second.x),
    top: Math.min(first.y, second.y),
    width: Math.abs(second.x - first.x),
    height: Math.abs(second.y - first.y),
  };
}

/** Page box in CSS pixels at a zoom level. Zoom 1 = 72 dpi = one pixel per point. */
export function pageBoxAt(size: PageSize, zoom: number): { width: number; height: number } {
  return { width: Math.max(1, size.width * zoom), height: Math.max(1, size.height * zoom) };
}

/** Zoom that makes the page fill the available width, leaving room for the gutter. */
export function fitWidthZoom(containerWidth: number, size: PageSize, gutter: number): number {
  const usable = containerWidth - gutter;
  if (usable <= 0 || size.width <= 0) return 1;
  return usable / size.width;
}

/** Zoom that shows one whole page — the smaller of the width and height fits. */
export function fitPageZoom(
  containerWidth: number,
  containerHeight: number,
  size: PageSize,
  gutter: number
): number {
  const usableHeight = containerHeight - gutter;
  if (usableHeight <= 0 || size.height <= 0) return fitWidthZoom(containerWidth, size, gutter);
  return Math.min(fitWidthZoom(containerWidth, size, gutter), usableHeight / size.height);
}

/**
 * The one place raster pixels and PDF user space meet.
 *
 * Tesseract reports boxes in the pixels of the image it was given, with a
 * TOP-LEFT origin. The renderer produced that image from pdfjs, whose viewport
 * is *display* space: the crop box, already turned by the page's /Rotate. PDF
 * user space is neither — bottom-left origin, points, untuned by /Rotate.
 *
 * So the writer draws in display space and prepends one `cm` matrix that maps
 * display space back into user space. That keeps every word placement a simple
 * scale-and-flip, and confines rotation to the six numbers below.
 */

import type { PageSize, PdfRect } from '@shared/types';
import type { PixelBox } from './types';

/** A PDF transformation matrix: `a b c d e f cm`. */
export type Matrix6 = readonly [number, number, number, number, number, number];

export const POINTS_PER_INCH = 72;

/** Points per raster pixel at a given DPI (300 DPI → 0.24 pt/px). */
export function pointsPerPixel(dpi: number): number {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new RangeError(`OCR needs a positive DPI, got ${dpi}.`);
  }
  return POINTS_PER_INCH / dpi;
}

/** /Rotate is a multiple of 90 but may be negative or oversized in the wild. */
export function normalizeRotation(degrees: number): 0 | 90 | 180 | 270 {
  const turned = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return turned as 0 | 90 | 180 | 270;
}

/** What the rasterizer saw: the crop box, swapped when /Rotate turns the page. */
export function displaySize(rotation: number, crop: PdfRect): PageSize {
  const turned = normalizeRotation(rotation);
  const swapped = turned === 90 || turned === 270;
  return {
    width: swapped ? crop.height : crop.width,
    height: swapped ? crop.width : crop.height,
  };
}

/**
 * Display space → user space. /Rotate turns the page CLOCKWISE when displayed,
 * so the inverse turns our display coordinates counter-clockwise back onto the
 * unrotated page, then shifts by the crop box origin.
 */
export function displayToUserMatrix(rotation: number, crop: PdfRect): Matrix6 {
  const { width, height } = crop;
  const base: Record<0 | 90 | 180 | 270, Matrix6> = {
    0: [1, 0, 0, 1, 0, 0],
    90: [0, 1, -1, 0, width, 0],
    180: [-1, 0, 0, -1, width, height],
    270: [0, -1, 1, 0, 0, height],
  };
  const [a, b, c, d, e, f] = base[normalizeRotation(rotation)];
  return [a, b, c, d, e + crop.x, f + crop.y];
}

/** Apply a matrix to a point — used by tests to prove the mapping round-trips. */
export function applyMatrix(matrix: Matrix6, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Points per pixel on each axis, taken from the raster we actually received. */
export function rasterScale(
  display: PageSize,
  widthPx: number,
  heightPx: number
): { scaleX: number; scaleY: number } {
  if (widthPx <= 0 || heightPx <= 0) {
    throw new RangeError(`The raster reports no area (${widthPx} x ${heightPx} px).`);
  }
  return { scaleX: display.width / widthPx, scaleY: display.height / heightPx };
}

/**
 * hOCR pixel box (top-left origin) → display-space rect in points (bottom-left
 * origin). The vertical flip is the whole trick: hOCR's y grows downward.
 */
export function wordRect(
  box: PixelBox,
  scaleX: number,
  scaleY: number,
  display: PageSize
): PdfRect {
  const left = box.x0 * scaleX;
  const right = box.x1 * scaleX;
  const top = display.height - box.y0 * scaleY;
  const bottom = display.height - box.y1 * scaleY;
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

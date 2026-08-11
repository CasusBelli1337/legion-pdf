/**
 * The burn: marked regions become opaque black PIXELS, not a black rectangle
 * drawn over readable ones.
 *
 * This is the single step that makes redaction destruction rather than
 * decoration, so it counts what it painted and refuses to hand back an image it
 * did not actually change. A burn that reports success having blacked out zero
 * pixels is the exact "fast and empty" failure the house rules forbid.
 */

import { decodePng, toOpaqueRgb } from './png-decode';
import { encodeRgbPng } from './png-encode';
import { RedactionGeometryError } from './types';
import type { PixelRect, RgbImage } from './types';

/** Opaque black. Not near-black: a redaction is not a shade. */
const BLACK = 0;

function paintRect(image: RgbImage, rect: PixelRect): number {
  const right = Math.min(image.widthPx, rect.x + rect.width);
  const bottom = Math.min(image.heightPx, rect.y + rect.height);
  let painted = 0;
  for (let row = Math.max(0, rect.y); row < bottom; row += 1) {
    const rowStart = row * image.widthPx * 3;
    for (let column = Math.max(0, rect.x); column < right; column += 1) {
      const offset = rowStart + column * 3;
      image.rgb[offset] = BLACK;
      image.rgb[offset + 1] = BLACK;
      image.rgb[offset + 2] = BLACK;
      painted += 1;
    }
  }
  return painted;
}

export interface BurnResult {
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
  /** Pixels actually blacked out. Zero means nothing was destroyed. */
  paintedPixels: number;
}

/**
 * Decode the page raster, black out every marked rectangle, and re-encode.
 * The returned PNG is the ONLY thing that goes on to become the rebuilt page,
 * so nothing that was painted here can survive downstream.
 */
export function burnRects(png: Uint8Array, rects: readonly PixelRect[]): BurnResult {
  if (rects.length === 0) {
    throw new RedactionGeometryError('A page was scheduled for redaction with no marks on it.');
  }
  const image = toOpaqueRgb(decodePng(png));
  let paintedPixels = 0;
  for (const rect of rects) paintedPixels += paintRect(image, rect);
  if (paintedPixels === 0) {
    throw new RedactionGeometryError(
      'The marked regions covered no pixels of the page — refusing to report a redaction ' +
        'that destroyed nothing.'
    );
  }
  return {
    png: encodeRgbPng(image),
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    paintedPixels,
  };
}

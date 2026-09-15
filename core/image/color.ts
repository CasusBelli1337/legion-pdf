/**
 * Colour treatment for exported page images.
 *
 * Attorneys ask for these three for real reasons, so they are named in those
 * terms: colour (the page as it looks), grayscale (half the file size, still
 * readable), and black-and-white (the smallest thing a court's e-filing portal
 * will take — a fax of the page). Every conversion goes RGB → gray → bilevel,
 * one direction only, so there is exactly one place each rule lives.
 */

import type { ExportColorMode } from '@shared/types';
import { assertImage, bytesPerRow } from './types';
import type { PageImage } from './types';

/** BT.601 luma — what every scanner and fax machine has always used. */
const RED = 0.299;
const GREEN = 0.587;
const BLUE = 0.114;

/** Mid-scale. Anything darker than this becomes ink; anything lighter, paper. */
export const BILEVEL_THRESHOLD = 128;

function sample(samples: Uint8Array, index: number): number {
  return samples[index] ?? 0;
}

export function rgbToGray(image: PageImage): PageImage {
  if (image.kind !== 'rgb') return image;
  assertImage(image, 'The page raster');
  const pixels = image.widthPx * image.heightPx;
  const gray = new Uint8Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const from = pixel * 3;
    gray[pixel] = Math.round(
      RED * sample(image.samples, from) +
        GREEN * sample(image.samples, from + 1) +
        BLUE * sample(image.samples, from + 2)
    );
  }
  return { kind: 'gray', widthPx: image.widthPx, heightPx: image.heightPx, samples: gray };
}

/**
 * Gray → 1 bit, MSB first, a set bit meaning black ink. Rows are padded to a
 * whole byte because that is what both TIFF and every fax format expect.
 */
export function grayToBilevel(image: PageImage, threshold = BILEVEL_THRESHOLD): PageImage {
  if (image.kind !== 'gray') return image;
  assertImage(image, 'The page raster');
  const stride = Math.ceil(image.widthPx / 8);
  const bits = new Uint8Array(stride * image.heightPx);
  for (let row = 0; row < image.heightPx; row += 1) {
    for (let column = 0; column < image.widthPx; column += 1) {
      if (sample(image.samples, row * image.widthPx + column) >= threshold) continue;
      const index = row * stride + (column >> 3);
      bits[index] = (bits[index] ?? 0) | (0x80 >> (column & 7));
    }
  }
  return { kind: 'bilevel', widthPx: image.widthPx, heightPx: image.heightPx, samples: bits };
}

function bilevelToRgb(image: PageImage): PageImage {
  const stride = bytesPerRow(image);
  const rgb = new Uint8Array(image.widthPx * image.heightPx * 3);
  for (let row = 0; row < image.heightPx; row += 1) {
    for (let column = 0; column < image.widthPx; column += 1) {
      const byte = sample(image.samples, row * stride + (column >> 3));
      const value = (byte & (0x80 >> (column & 7))) === 0 ? 255 : 0;
      const to = (row * image.widthPx + column) * 3;
      rgb[to] = value;
      rgb[to + 1] = value;
      rgb[to + 2] = value;
    }
  }
  return { kind: 'rgb', widthPx: image.widthPx, heightPx: image.heightPx, samples: rgb };
}

function grayToRgb(image: PageImage): PageImage {
  const pixels = image.widthPx * image.heightPx;
  const rgb = new Uint8Array(pixels * 3);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const value = sample(image.samples, pixel);
    rgb[pixel * 3] = value;
    rgb[pixel * 3 + 1] = value;
    rgb[pixel * 3 + 2] = value;
  }
  return { kind: 'rgb', widthPx: image.widthPx, heightPx: image.heightPx, samples: rgb };
}

/**
 * Back up to three bytes per pixel. PNG and JPEG both want RGB, so a grayscale
 * or black-and-white export still travels through here on its way to a file
 * that is not a TIFF — the pixels are already reduced, this only re-widens them.
 */
export function toRgb(image: PageImage): PageImage {
  assertImage(image, 'The page image');
  if (image.kind === 'rgb') return image;
  return image.kind === 'gray' ? grayToRgb(image) : bilevelToRgb(image);
}

/** The one entry point the exporters call. Config over code: mode → pipeline. */
export function convertColor(image: PageImage, mode: ExportColorMode): PageImage {
  if (mode === 'color') return image;
  const gray = rgbToGray(image);
  return mode === 'grayscale' ? gray : grayToBilevel(gray);
}

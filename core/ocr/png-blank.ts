/**
 * Was that page really blank, or did OCR just fail on it?
 *
 * A page that comes back with zero words is only acceptable when its image is
 * genuinely empty. Everything else — a spawn that died, a scan too faint to
 * read — must fail the run rather than quietly leave a page with no text. So
 * the zero-word case is settled by looking at the actual pixels.
 *
 * Only the PNG flavours the renderer's OffscreenCanvas produces are supported
 * (8-bit gray/RGB/RGBA, no interlacing). Anything else throws: an unreadable
 * raster is never evidence of blankness.
 */

import { inflateSync } from 'node:zlib';
import { UnsupportedRasterError } from './types';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** A pixel counts as ink when it is darker than this, composited over white. */
const WHITE_FLOOR = 250;

/** Below this share of inked pixels the page is treated as blank paper. */
export const BLANK_INK_RATIO = 0.0002;

interface PngHeader {
  width: number;
  height: number;
  channels: number;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}

function assertSignature(png: Uint8Array): void {
  const ok = png.length > 8 && SIGNATURE.every((byte, index) => png[index] === byte);
  if (!ok) throw new UnsupportedRasterError('The rasterized page is not a PNG image.');
}

function readHeader(png: Uint8Array): PngHeader {
  const bitDepth = png[24];
  const colorType = png[25] ?? -1;
  const interlace = png[28];
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new UnsupportedRasterError(
      `Unsupported PNG raster (bit depth ${bitDepth}, colour type ${colorType}, ` +
        `interlace ${interlace}) — cannot prove the page is blank.`
    );
  }
  return { width: readUint32(png, 16), height: readUint32(png, 20), channels };
}

/** Concatenate every IDAT chunk; PNG allows the pixel data to be split. */
function readPixelData(png: Uint8Array): Uint8Array {
  const decoder = new TextDecoder('latin1');
  const parts: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = readUint32(png, offset);
    const type = decoder.decode(png.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += length + 12;
  }
  if (parts.length === 0)
    throw new UnsupportedRasterError('The PNG raster contains no pixel data.');
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    joined.set(part, cursor);
    cursor += part.length;
  }
  return joined;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

const RECONSTRUCT: Record<number, (x: number, a: number, b: number, c: number) => number> = {
  0: (x) => x,
  1: (x, a) => x + a,
  2: (x, _a, b) => x + b,
  3: (x, a, b) => x + Math.floor((a + b) / 2),
  4: (x, a, b, c) => x + paeth(a, b, c),
};

function byteAt(bytes: Uint8Array, index: number): number {
  return bytes[index] ?? 0;
}

/** One scanline, un-filtered against the pixels to its left and above it. */
function reconstructRow(out: Uint8Array, raw: Uint8Array, row: number, header: PngHeader): void {
  const stride = header.width * header.channels;
  const filterType = byteAt(raw, row * (stride + 1));
  const reconstruct = RECONSTRUCT[filterType];
  if (reconstruct === undefined) {
    throw new UnsupportedRasterError(`The PNG raster uses unknown filter ${filterType}.`);
  }
  const source = row * (stride + 1) + 1;
  const target = row * stride;
  const bpp = header.channels;
  for (let index = 0; index < stride; index += 1) {
    const left = index >= bpp ? byteAt(out, target + index - bpp) : 0;
    const up = row > 0 ? byteAt(out, target - stride + index) : 0;
    const upLeft = row > 0 && index >= bpp ? byteAt(out, target - stride + index - bpp) : 0;
    out[target + index] = reconstruct(byteAt(raw, source + index), left, up, upLeft) & 0xff;
  }
}

/** Undo the per-scanline PNG filters, returning the raw pixel rows. */
function unfilter(raw: Uint8Array, header: PngHeader): Uint8Array {
  const out = new Uint8Array(header.width * header.channels * header.height);
  for (let row = 0; row < header.height; row += 1) reconstructRow(out, raw, row, header);
  return out;
}

function pixelIsInk(pixels: Uint8Array, offset: number, channels: number): boolean {
  const first = pixels[offset] ?? 255;
  const gray =
    channels >= 3
      ? ((pixels[offset] ?? 255) + (pixels[offset + 1] ?? 255) + (pixels[offset + 2] ?? 255)) / 3
      : first;
  const alpha =
    channels === 2
      ? (pixels[offset + 1] ?? 255)
      : channels === 4
        ? (pixels[offset + 3] ?? 255)
        : 255;
  const overWhite = (gray * alpha + 255 * (255 - alpha)) / 255;
  return overWhite < WHITE_FLOOR;
}

/** Share of pixels carrying ink, 0–1. Throws rather than guess on odd PNGs. */
export function inkRatio(png: Uint8Array): number {
  assertSignature(png);
  const header = readHeader(png);
  if (header.width <= 0 || header.height <= 0) {
    throw new UnsupportedRasterError('The PNG raster reports no area.');
  }
  const pixels = unfilter(new Uint8Array(inflateSync(readPixelData(png))), header);
  let inked = 0;
  for (let offset = 0; offset < pixels.length; offset += header.channels) {
    if (pixelIsInk(pixels, offset, header.channels)) inked += 1;
  }
  return inked / (header.width * header.height);
}

/** True when the raster is blank paper — the only excuse for a page with no words. */
export function isBlankRaster(png: Uint8Array, threshold: number = BLANK_INK_RATIO): boolean {
  return inkRatio(png) < threshold;
}

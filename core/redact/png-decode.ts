/**
 * Taking a page raster apart, pixel by pixel.
 *
 * Redaction cannot be a rectangle drawn ON a picture of the page — the picture
 * underneath would still hold the words. The marked pixels have to be replaced,
 * which means decoding the renderer's PNG down to samples, painting, and
 * re-encoding. This is the decode half.
 *
 * Only the PNG flavours OffscreenCanvas produces are supported (8-bit
 * gray/gray+alpha/RGB/RGBA, no interlacing). Anything else throws: a raster this
 * engine cannot fully decode is a raster it cannot prove it blacked out.
 */

import { inflateSync } from 'node:zlib';
import { UnsupportedRedactionRasterError } from './types';
import type { RgbImage } from './types';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export interface DecodedPng {
  widthPx: number;
  heightPx: number;
  /** 1 = gray, 2 = gray+alpha, 3 = RGB, 4 = RGBA. */
  channels: number;
  /** Un-filtered samples, widthPx * heightPx * channels bytes. */
  samples: Uint8Array;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}

function readHeader(png: Uint8Array): Omit<DecodedPng, 'samples'> {
  const signed = png.length > 8 && SIGNATURE.every((byte, index) => png[index] === byte);
  if (!signed) throw new UnsupportedRedactionRasterError('The page raster is not a PNG image.');
  const bitDepth = png[24];
  const colorType = png[25] ?? -1;
  const interlace = png[28];
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new UnsupportedRedactionRasterError(
      `Librarius cannot take this page raster apart (bit depth ${bitDepth}, colour type ` +
        `${colorType}, interlace ${interlace}) — it will not claim to have destroyed it.`
    );
  }
  const widthPx = readUint32(png, 16);
  const heightPx = readUint32(png, 20);
  if (widthPx <= 0 || heightPx <= 0) {
    throw new UnsupportedRedactionRasterError('The page raster reports no area.');
  }
  return { widthPx, heightPx, channels };
}

/** Concatenate every IDAT chunk; PNG is allowed to split the pixel data. */
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
  if (parts.length === 0) {
    throw new UnsupportedRedactionRasterError('The page raster contains no pixel data.');
  }
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
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
function reconstructRow(
  out: Uint8Array,
  raw: Uint8Array,
  row: number,
  stride: number,
  bpp: number
): void {
  const filterType = byteAt(raw, row * (stride + 1));
  const reconstruct = RECONSTRUCT[filterType];
  if (reconstruct === undefined) {
    throw new UnsupportedRedactionRasterError(`The page raster uses unknown filter ${filterType}.`);
  }
  const source = row * (stride + 1) + 1;
  const target = row * stride;
  for (let index = 0; index < stride; index += 1) {
    const left = index >= bpp ? byteAt(out, target + index - bpp) : 0;
    const up = row > 0 ? byteAt(out, target - stride + index) : 0;
    const upLeft = row > 0 && index >= bpp ? byteAt(out, target - stride + index - bpp) : 0;
    out[target + index] = reconstruct(byteAt(raw, source + index), left, up, upLeft) & 0xff;
  }
}

/** A PNG as raw samples. Throws rather than return a partially understood image. */
export function decodePng(png: Uint8Array): DecodedPng {
  const header = readHeader(png);
  const stride = header.widthPx * header.channels;
  const raw = new Uint8Array(inflateSync(readPixelData(png)));
  if (raw.length < header.heightPx * (stride + 1)) {
    throw new UnsupportedRedactionRasterError(
      `The page raster is truncated: ${raw.length} bytes of pixel data where ` +
        `${header.heightPx * (stride + 1)} were expected.`
    );
  }
  const samples = new Uint8Array(stride * header.heightPx);
  for (let row = 0; row < header.heightPx; row += 1) {
    reconstructRow(samples, raw, row, stride, header.channels);
  }
  return { ...header, samples };
}

function sampleAt(decoded: DecodedPng, offset: number, channel: number): number {
  return decoded.samples[offset + channel] ?? 255;
}

/**
 * Flatten any supported PNG onto opaque white RGB. Compositing here rather than
 * carrying an alpha channel forward means the rebuilt page can never be
 * see-through: a transparent "black" box is exactly the failure this file exists
 * to rule out.
 */
export function toOpaqueRgb(decoded: DecodedPng): RgbImage {
  const pixels = decoded.widthPx * decoded.heightPx;
  const rgb = new Uint8Array(pixels * 3);
  const hasColor = decoded.channels >= 3;
  const alphaChannel = decoded.channels === 2 ? 1 : decoded.channels === 4 ? 3 : -1;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const from = pixel * decoded.channels;
    const alpha = alphaChannel === -1 ? 255 : sampleAt(decoded, from, alphaChannel);
    for (let channel = 0; channel < 3; channel += 1) {
      const value = sampleAt(decoded, from, hasColor ? channel : 0);
      rgb[pixel * 3 + channel] = Math.round((value * alpha + 255 * (255 - alpha)) / 255);
    }
  }
  return { widthPx: decoded.widthPx, heightPx: decoded.heightPx, rgb };
}

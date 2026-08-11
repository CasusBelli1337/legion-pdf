/**
 * Putting the burned raster back together as a PNG.
 *
 * The burned image has two consumers and they both want a PNG: pdf-lib embeds
 * it as the rebuilt page, and Tesseract reads it when the user asks to keep the
 * document searchable. Writing one PNG for both is what guarantees the optional
 * text layer is derived from the SAME pixels that were blacked out — the text
 * layer cannot contain what the image no longer shows.
 *
 * Written as 8-bit truecolour with no alpha and no per-row prediction: the
 * simplest encoding a PDF reader and Tesseract both accept, and the one with the
 * fewest ways to be subtly wrong.
 */

import { crc32, deflateSync } from 'node:zlib';
import type { RgbImage } from './types';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BIT_DEPTH = 8;
/** PNG colour type 2: three 8-bit samples per pixel, no alpha. */
const COLOR_TYPE_RGB = 2;

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0);
  return bytes;
}

/** length + type + data + CRC(type + data), the shape of every PNG chunk. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(uint32(data.length), 0);
  out.set(body, 4);
  out.set(uint32(crc32(body)), 4 + body.length);
  return out;
}

function headerChunk(image: RgbImage): Uint8Array {
  const data = new Uint8Array(13);
  data.set(uint32(image.widthPx), 0);
  data.set(uint32(image.heightPx), 4);
  data[8] = BIT_DEPTH;
  data[9] = COLOR_TYPE_RGB;
  return chunk('IHDR', data);
}

/** Each scanline is prefixed with filter type 0 (None) — no prediction at all. */
function filteredRows(image: RgbImage): Uint8Array {
  const stride = image.widthPx * 3;
  const out = new Uint8Array((stride + 1) * image.heightPx);
  for (let row = 0; row < image.heightPx; row += 1) {
    out[row * (stride + 1)] = 0;
    out.set(image.rgb.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  return out;
}

/** Encode an opaque RGB raster as a PNG. Refuses to emit an empty image. */
export function encodeRgbPng(image: RgbImage): Uint8Array {
  const expected = image.widthPx * image.heightPx * 3;
  if (image.widthPx <= 0 || image.heightPx <= 0 || image.rgb.length !== expected) {
    throw new RangeError(
      `Refusing to encode a ${image.widthPx}x${image.heightPx} raster carrying ` +
        `${image.rgb.length} bytes where ${expected} were expected.`
    );
  }
  const idat = new Uint8Array(deflateSync(Buffer.from(filteredRows(image))));
  const parts = [
    SIGNATURE,
    headerChunk(image),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    png.set(part, cursor);
    cursor += part.length;
  }
  return png;
}

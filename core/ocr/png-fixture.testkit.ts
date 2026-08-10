/**
 * TEST SUPPORT ONLY — never imported by shipping code.
 *
 * Builds real PNG bytes (true IHDR/IDAT/IEND chunks with real CRCs) so the
 * blank-raster check and the OCR service are tested against actual PNG
 * encoding rather than a stub that agrees with the decoder by construction.
 */

import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE: Record<number, number> = { 1: 0, 2: 4, 3: 2, 4: 6 };

export interface PngFixtureOptions {
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
  /** Filter byte written on every scanline; exercises the un-filtering. */
  filter?: number;
  paint(x: number, y: number): number[];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function rawScanlines(options: PngFixtureOptions): Uint8Array {
  const { width, height, channels, filter = 0 } = options;
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  const previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const row = new Uint8Array(stride);
    for (let x = 0; x < width; x += 1)
      row.set(options.paint(x, y).slice(0, channels), x * channels);
    raw[y * (stride + 1)] = filter;
    for (let index = 0; index < stride; index += 1) {
      const up = previous[index] ?? 0;
      raw[y * (stride + 1) + 1 + index] = ((row[index] ?? 0) - (filter === 2 ? up : 0)) & 0xff;
    }
    previous.set(row);
  }
  return raw;
}

export function makePng(options: PngFixtureOptions): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, options.width);
  view.setUint32(4, options.height);
  header[8] = 8;
  header[9] = COLOR_TYPE[options.channels] ?? 0;
  return concatBytes([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(rawScanlines(options)))),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Blank white paper. */
export function blankPng(width: number, height: number): Uint8Array {
  return makePng({ width, height, channels: 4, paint: () => [255, 255, 255, 255] });
}

/** Paper with a black band across it — inked, so never "blank". */
export function inkedPng(width: number, height: number): Uint8Array {
  return makePng({
    width,
    height,
    channels: 4,
    paint: (_x, y) =>
      y > height / 3 && y < (2 * height) / 3 ? [0, 0, 0, 255] : [255, 255, 255, 255],
  });
}

export { SIGNATURE as PNG_SIGNATURE, chunk as pngChunk };

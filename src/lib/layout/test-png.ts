/**
 * TEST SUPPORT ONLY — the smallest honest PNG encoder: one IDAT holding the
 * RGB rows filtered with "none" and deflated by Node's zlib. Lets the fixture
 * pipeline embed a real picture without reaching into core/ from src/.
 */

import { deflateSync } from 'node:zlib';

export interface RgbImage {
  widthPx: number;
  heightPx: number;
  /** widthPx × heightPx × 3 bytes. */
  rgb: Uint8Array;
}

const CRC_TABLE = Array.from({ length: 256 }, (_unused, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodeRgbPng({ widthPx, heightPx, rgb }: RgbImage): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, widthPx);
  view.setUint32(4, heightPx);
  header.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array((widthPx * 3 + 1) * heightPx);
  for (let y = 0; y < heightPx; y += 1) {
    raw.set(rgb.subarray(y * widthPx * 3, (y + 1) * widthPx * 3), y * (widthPx * 3 + 1) + 1);
  }
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

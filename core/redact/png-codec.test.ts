import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { makePng, pngChunk, PNG_SIGNATURE } from '@core/ocr/png-fixture.testkit';
import { decodePng, toOpaqueRgb } from './png-decode';
import { encodeRgbPng } from './png-encode';
import { UnsupportedRedactionRasterError } from './types';

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

describe('decodePng', () => {
  it('reads an RGBA canvas raster', () => {
    const png = makePng({ width: 4, height: 3, channels: 4, paint: () => [10, 20, 30, 255] });
    const decoded = decodePng(png);
    expect(decoded).toMatchObject({ widthPx: 4, heightPx: 3, channels: 4 });
    expect(decoded.samples.length).toBe(4 * 3 * 4);
    expect([...decoded.samples.slice(0, 4)]).toEqual([10, 20, 30, 255]);
  });

  it('un-filters a raster written with the Up predictor', () => {
    const png = makePng({
      width: 3,
      height: 3,
      channels: 3,
      filter: 2,
      paint: (x) => [x * 10, x * 10, x * 10],
    });
    const decoded = decodePng(png);
    expect([...decoded.samples.slice(0, 9)]).toEqual([0, 0, 0, 10, 10, 10, 20, 20, 20]);
  });

  it('reads greyscale', () => {
    const png = makePng({ width: 2, height: 2, channels: 1, paint: () => [128] });
    expect(decodePng(png).channels).toBe(1);
  });

  it('refuses anything that is not a PNG', () => {
    expect(() => decodePng(Uint8Array.from([1, 2, 3]))).toThrow(UnsupportedRedactionRasterError);
  });

  it('refuses a 16-bit raster rather than guess at the samples', () => {
    const header = new Uint8Array(13);
    new DataView(header.buffer).setUint32(0, 2);
    new DataView(header.buffer).setUint32(4, 2);
    header[8] = 16;
    header[9] = 2;
    const png = concat([
      PNG_SIGNATURE,
      pngChunk('IHDR', header),
      pngChunk('IDAT', new Uint8Array(deflateSync(new Uint8Array(26)))),
      pngChunk('IEND', new Uint8Array()),
    ]);
    expect(() => decodePng(png)).toThrow(/cannot take this page raster apart/);
  });

  it('refuses a truncated raster instead of decoding half a page', () => {
    const header = new Uint8Array(13);
    new DataView(header.buffer).setUint32(0, 100);
    new DataView(header.buffer).setUint32(4, 100);
    header[8] = 8;
    header[9] = 2;
    const png = concat([
      PNG_SIGNATURE,
      pngChunk('IHDR', header),
      pngChunk('IDAT', new Uint8Array(deflateSync(new Uint8Array(10)))),
      pngChunk('IEND', new Uint8Array()),
    ]);
    expect(() => decodePng(png)).toThrow(/truncated/);
  });
});

describe('toOpaqueRgb', () => {
  it('composites transparency over white so nothing stays see-through', () => {
    const png = makePng({ width: 2, height: 1, channels: 4, paint: () => [0, 0, 0, 0] });
    const image = toOpaqueRgb(decodePng(png));
    expect([...image.rgb]).toEqual([255, 255, 255, 255, 255, 255]);
  });

  it('expands greyscale to three channels', () => {
    const png = makePng({ width: 1, height: 1, channels: 1, paint: () => [64] });
    expect([...toOpaqueRgb(decodePng(png)).rgb]).toEqual([64, 64, 64]);
  });

  it('keeps opaque colour untouched', () => {
    const png = makePng({ width: 1, height: 1, channels: 4, paint: () => [12, 34, 56, 255] });
    expect([...toOpaqueRgb(decodePng(png)).rgb]).toEqual([12, 34, 56]);
  });
});

describe('encodeRgbPng', () => {
  it('round-trips through the decoder unchanged', () => {
    const rgb = new Uint8Array(4 * 3 * 3);
    for (let index = 0; index < rgb.length; index += 1) rgb[index] = index % 251;
    const png = encodeRgbPng({ widthPx: 4, heightPx: 3, rgb });
    const decoded = decodePng(png);
    expect(decoded).toMatchObject({ widthPx: 4, heightPx: 3, channels: 3 });
    expect([...decoded.samples]).toEqual([...rgb]);
  });

  it('writes a real PNG signature', () => {
    const png = encodeRgbPng({ widthPx: 1, heightPx: 1, rgb: Uint8Array.from([1, 2, 3]) });
    expect([...png.slice(0, 8)]).toEqual([...PNG_SIGNATURE]);
  });

  it('refuses a raster whose byte count disagrees with its size', () => {
    expect(() => encodeRgbPng({ widthPx: 4, heightPx: 4, rgb: new Uint8Array(3) })).toThrow(
      RangeError
    );
  });
});

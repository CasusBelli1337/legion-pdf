/**
 * PNGs are built by the shared fixture kit (real IHDR/IDAT/IEND chunks with
 * real CRCs) so the blank check is tested against actual PNG encoding.
 */

import { describe, expect, it } from 'vitest';
import { BLANK_INK_RATIO, inkRatio, isBlankRaster } from './png-blank';
import { UnsupportedRasterError } from './types';
import { PNG_SIGNATURE, concatBytes, makePng, pngChunk } from './png-fixture.testkit';

const white = (): number[] => [255, 255, 255, 255];

describe('inkRatio', () => {
  it('reports no ink on a blank white RGBA raster', () => {
    expect(inkRatio(makePng({ width: 40, height: 40, channels: 4, paint: white }))).toBe(0);
  });

  it('counts the inked share of an RGB raster', () => {
    const png = makePng({
      width: 10,
      height: 10,
      channels: 3,
      paint: (x, y) => (x === 0 && y === 0 ? [0, 0, 0] : [255, 255, 255]),
    });
    expect(inkRatio(png)).toBeCloseTo(0.01, 6);
  });

  it('reads 8-bit grayscale rasters', () => {
    const png = makePng({
      width: 4,
      height: 4,
      channels: 1,
      paint: (x) => (x < 2 ? [0] : [255]),
    });
    expect(inkRatio(png)).toBeCloseTo(0.5, 6);
  });

  it('treats transparent pixels as the white paper behind them', () => {
    const png = makePng({ width: 8, height: 8, channels: 2, paint: () => [0, 0] });
    expect(inkRatio(png)).toBe(0);
  });

  it('un-filters an Up-filtered raster correctly', () => {
    const png = makePng({
      width: 8,
      height: 8,
      channels: 3,
      filter: 2,
      paint: (_x, y) => (y === 4 ? [10, 10, 10] : [255, 255, 255]),
    });
    expect(inkRatio(png)).toBeCloseTo(0.125, 6);
  });

  it('refuses a file that is not a PNG at all', () => {
    expect(() => inkRatio(new TextEncoder().encode('%PDF-1.7'))).toThrow(UnsupportedRasterError);
  });

  it('refuses a PNG with no pixel data instead of calling it blank', () => {
    const header = new Uint8Array(13);
    new DataView(header.buffer).setUint32(0, 4);
    new DataView(header.buffer).setUint32(4, 4);
    header[8] = 8;
    const png = concatBytes([
      PNG_SIGNATURE,
      pngChunk('IHDR', header),
      pngChunk('IEND', new Uint8Array()),
    ]);
    expect(() => inkRatio(png)).toThrow(/no pixel data/);
  });

  it('refuses a palette PNG rather than guessing at its colours', () => {
    const png = makePng({ width: 4, height: 4, channels: 4, paint: white });
    png[25] = 3; // colour type 3 = palette
    expect(() => inkRatio(png)).toThrow(/Unsupported PNG raster/);
  });

  it('refuses an interlaced PNG', () => {
    const png = makePng({ width: 4, height: 4, channels: 4, paint: white });
    png[28] = 1;
    expect(() => inkRatio(png)).toThrow(/Unsupported PNG raster/);
  });
});

describe('isBlankRaster', () => {
  it('calls an empty page blank', () => {
    expect(isBlankRaster(makePng({ width: 50, height: 50, channels: 4, paint: white }))).toBe(true);
  });

  it('calls a page with a single line of text NOT blank', () => {
    const png = makePng({
      width: 100,
      height: 100,
      channels: 4,
      paint: (_x, y) => (y === 50 ? [0, 0, 0, 255] : [255, 255, 255, 255]),
    });
    expect(inkRatio(png)).toBeGreaterThan(BLANK_INK_RATIO);
    expect(isBlankRaster(png)).toBe(false);
  });

  it('tolerates a stray speck of scanner noise on otherwise blank paper', () => {
    const png = makePng({
      width: 300,
      height: 300,
      channels: 4,
      paint: (x, y) => (x === 5 && y === 5 ? [0, 0, 0, 255] : [255, 255, 255, 255]),
    });
    expect(isBlankRaster(png)).toBe(true);
  });
});

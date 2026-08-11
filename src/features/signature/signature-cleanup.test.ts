import { describe, expect, it } from 'vitest';
import { dropSpecks, minSpeckArea } from './signature-despeckle';
import {
  cleanByDefault,
  cleanSignature,
  hasTransparency,
  inkMap,
  localMean,
  otsuThreshold,
  thresholdFor,
  toGrayscale,
  type Pixels,
} from './signature-cleanup';

const SIZE = 64;

interface Ink {
  x: number;
  y: number;
}

function blank(width: number, height: number): Pixels {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function set(pixels: Pixels, x: number, y: number, grey: number, alpha = 255): void {
  const offset = (y * pixels.width + x) * 4;
  pixels.data[offset] = grey;
  pixels.data[offset + 1] = grey;
  pixels.data[offset + 2] = grey;
  pixels.data[offset + 3] = alpha;
}

function alphaAt(pixels: Pixels, x: number, y: number): number {
  return pixels.data[(y * pixels.width + x) * 4 + 3] ?? 0;
}

/**
 * A photographed signature, as they actually arrive: grey paper that is
 * markedly brighter on one side than the other (phone flash from the left), a
 * pen stroke across the middle, and two specks of paper grain.
 */
const SPECKS: Ink[] = [
  { x: 5, y: 5 },
  { x: 60, y: 10 },
];

function photographedScan(): Pixels {
  const pixels = blank(SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) set(pixels, x, y, 180 - x);
  }
  for (let y = 30; y <= 33; y += 1) {
    for (let x = 8; x <= 56; x += 1) set(pixels, x, y, 30);
  }
  for (const speck of SPECKS) set(pixels, speck.x, speck.y, 40);
  return pixels;
}

describe('cleaning up a photographed signature', () => {
  const cleaned = cleanSignature(photographedScan());

  it('keeps the image the same size', () => {
    expect(cleaned.width).toBe(SIZE);
    expect(cleaned.height).toBe(SIZE);
    expect(cleaned.data.length).toBe(SIZE * SIZE * 4);
  });

  it('keeps the pen stroke, solidly', () => {
    expect(alphaAt(cleaned, 20, 31)).toBeGreaterThan(200);
    expect(alphaAt(cleaned, 45, 32)).toBeGreaterThan(200);
  });

  it('leaves the corners fully transparent, both the lit one and the shaded one', () => {
    expect(alphaAt(cleaned, 0, 0)).toBe(0);
    expect(alphaAt(cleaned, SIZE - 1, SIZE - 1)).toBe(0);
    expect(alphaAt(cleaned, SIZE - 1, 0)).toBe(0);
  });

  it('drops the paper entirely, gradient and all', () => {
    expect(alphaAt(cleaned, 20, 10)).toBe(0);
    expect(alphaAt(cleaned, 20, 55)).toBe(0);
    expect(alphaAt(cleaned, 3, 40)).toBe(0);
  });

  it('drops the specks — grain is not ink, however dark it is', () => {
    for (const speck of SPECKS) expect(alphaAt(cleaned, speck.x, speck.y)).toBe(0);
  });

  it('turns nothing on a blank sheet into ink', () => {
    const blankSheet = blank(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) set(blankSheet, x, y, 200 - (x % 3));
    }
    const result = cleanSignature(blankSheet);
    const opaque = [...result.data].filter((_, index) => index % 4 === 3 && _ > 0);
    expect(opaque).toEqual([]);
  });

  it('keeps more of a faint stroke as the slider is pushed up', () => {
    const scan = photographedScan();
    const inked = (pixels: Pixels): number =>
      [...pixels.data].filter((value, index) => index % 4 === 3 && value > 0).length;
    expect(inked(cleanSignature(scan, 100))).toBeGreaterThanOrEqual(inked(cleanSignature(scan, 0)));
  });
});

describe('the pieces of the pipeline', () => {
  it('reads a transparent pixel as paper, not as black', () => {
    const pixels = blank(2, 1);
    set(pixels, 0, 0, 0, 0);
    set(pixels, 1, 0, 0, 255);
    const gray = toGrayscale(pixels);
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
  });

  it('follows the paper rather than a single global brightness', () => {
    const width = 32;
    const gray = new Float32Array(width * 4);
    for (let index = 0; index < gray.length; index += 1) gray[index] = 200 - (index % width) * 4;
    const mean = localMean(gray, width, 4, 4);
    // The estimate at each end tracks that end's own brightness.
    expect(mean[0] ?? 0).toBeGreaterThan(mean[width - 1] ?? 0);
    expect(Math.abs((mean[16] ?? 0) - (gray[16] ?? 0))).toBeLessThan(2);
  });

  it('measures ink as darkness against the local paper, never below zero', () => {
    const gray = Float32Array.from([100, 200]);
    const paper = Float32Array.from([180, 180]);
    expect([...inkMap(gray, paper)]).toEqual([80, 0]);
  });

  it('splits a two-humped ink map between the humps', () => {
    const ink = Float32Array.from([...Array(90).fill(2), ...Array(10).fill(150)]);
    const threshold = otsuThreshold(ink);
    expect(threshold).toBeGreaterThan(2);
    expect(threshold).toBeLessThan(150);
  });

  it('never lets the threshold fall to scanner noise, whatever the slider says', () => {
    expect(thresholdFor(1, 100)).toBeGreaterThanOrEqual(18);
    expect(thresholdFor(100, 0)).toBeGreaterThan(thresholdFor(100, 100));
  });
});

describe('when the clean-up starts switched on', () => {
  it('is on for a photograph', () => {
    expect(cleanByDefault('image/jpeg', photographedScan())).toBe(true);
  });

  it('is on for a flat PNG that is all paper', () => {
    expect(cleanByDefault('image/png', photographedScan())).toBe(true);
  });

  it('is off for a PNG that already carries transparency', () => {
    const pixels = blank(4, 4);
    set(pixels, 0, 0, 0, 0);
    expect(hasTransparency(pixels)).toBe(true);
    expect(cleanByDefault('image/png', pixels)).toBe(false);
  });
});

describe('dropping specks', () => {
  it('keeps a region big enough to be a stroke and drops the dust', () => {
    const mask = new Uint8Array(64);
    for (const index of [9, 10, 11, 17, 18, 19]) mask[index] = 1;
    mask[0] = 1;
    mask[63] = 1;

    const kept = dropSpecks(mask, 8, 8, 4);
    expect(kept[10]).toBe(1);
    expect(kept[0]).toBe(0);
    expect(kept[63]).toBe(0);
  });

  it('joins a region diagonally split into two, because it is two', () => {
    const mask = new Uint8Array(16);
    mask[0] = 1;
    mask[5] = 1;
    expect([...dropSpecks(mask, 4, 4, 2)]).toEqual(Array(16).fill(0));
  });

  it('never asks for less than a handful of pixels, however small the image', () => {
    expect(minSpeckArea(10, 10)).toBe(4);
    expect(minSpeckArea(2000, 800)).toBe(32);
  });
});

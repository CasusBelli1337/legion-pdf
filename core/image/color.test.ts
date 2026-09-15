import { describe, expect, it } from 'vitest';
import { BILEVEL_THRESHOLD, convertColor, grayToBilevel, rgbToGray, toRgb } from './color';
import type { PageImage } from './types';

function rgbOf(widthPx: number, heightPx: number, pixels: readonly number[][]): PageImage {
  const samples = new Uint8Array(widthPx * heightPx * 3);
  pixels.forEach((pixel, index) => samples.set(pixel, index * 3));
  return { kind: 'rgb', widthPx, heightPx, samples };
}

describe('rgbToGray', () => {
  it('uses BT.601 luma, so colour weight matches what a scanner would do', () => {
    const image = rgbOf(4, 1, [
      [255, 255, 255],
      [0, 0, 0],
      [255, 0, 0],
      [0, 255, 0],
    ]);
    const gray = rgbToGray(image);
    expect(gray.kind).toBe('gray');
    expect([...gray.samples]).toEqual([255, 0, 76, 150]);
  });

  it('leaves an image that is already gray alone', () => {
    const gray: PageImage = { kind: 'gray', widthPx: 2, heightPx: 1, samples: Uint8Array.of(1, 2) };
    expect(rgbToGray(gray)).toBe(gray);
  });

  it('refuses a raster whose buffer does not match its size', () => {
    const broken: PageImage = { kind: 'rgb', widthPx: 3, heightPx: 2, samples: new Uint8Array(5) };
    expect(() => rgbToGray(broken)).toThrow(/5 bytes where 18 were expected/);
  });
});

describe('grayToBilevel', () => {
  it('packs rows MSB first with a set bit meaning black ink', () => {
    // 10 pixels: dark, light, dark, then light for the rest of the row.
    const samples = Uint8Array.from([0, 255, 10, 255, 255, 255, 255, 255, 255, 255]);
    const bw = grayToBilevel({ kind: 'gray', widthPx: 10, heightPx: 1, samples });
    expect(bw.kind).toBe('bilevel');
    // Row is ceil(10/8) = 2 bytes; bits 0 and 2 set in the first byte.
    expect([...bw.samples]).toEqual([0b10100000, 0b00000000]);
  });

  it('cuts at the halfway point — mid-gray is ink, one step lighter is paper', () => {
    const samples = Uint8Array.from([BILEVEL_THRESHOLD - 1, BILEVEL_THRESHOLD]);
    const bw = grayToBilevel({ kind: 'gray', widthPx: 2, heightPx: 1, samples });
    expect([...bw.samples]).toEqual([0b10000000]);
  });

  it('keeps every row byte-aligned', () => {
    const samples = new Uint8Array(9 * 3).fill(0);
    const bw = grayToBilevel({ kind: 'gray', widthPx: 9, heightPx: 3, samples });
    expect(bw.samples).toHaveLength(6);
    expect([...bw.samples]).toEqual([0xff, 0x80, 0xff, 0x80, 0xff, 0x80]);
  });
});

describe('toRgb', () => {
  it('re-widens grayscale for the formats that only speak RGB', () => {
    const gray: PageImage = {
      kind: 'gray',
      widthPx: 2,
      heightPx: 1,
      samples: Uint8Array.of(0, 128),
    };
    expect([...toRgb(gray).samples]).toEqual([0, 0, 0, 128, 128, 128]);
  });

  it('re-widens bilevel, set bit back to black', () => {
    const bw: PageImage = {
      kind: 'bilevel',
      widthPx: 2,
      heightPx: 1,
      samples: Uint8Array.of(0x80),
    };
    expect([...toRgb(bw).samples]).toEqual([0, 0, 0, 255, 255, 255]);
  });
});

describe('convertColor', () => {
  const image = rgbOf(2, 1, [
    [255, 255, 255],
    [10, 10, 10],
  ]);

  it('hands colour back untouched', () => {
    expect(convertColor(image, 'color')).toBe(image);
  });

  it('runs grayscale and black-and-white through the same one-way pipeline', () => {
    expect(convertColor(image, 'grayscale').kind).toBe('gray');
    const bw = convertColor(image, 'bw');
    expect(bw.kind).toBe('bilevel');
    expect([...bw.samples]).toEqual([0b01000000]);
  });
});

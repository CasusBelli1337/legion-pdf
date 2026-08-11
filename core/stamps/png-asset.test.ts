import { describe, expect, it } from 'vitest';
import { makePng } from '../ocr/png-fixture.testkit';
import { isPng, readPngInfo, scaleToHeight, MAX_SIGNATURE_BYTES } from './png-asset';

const png = (width: number, height: number): Uint8Array =>
  makePng({ width, height, channels: 4, paint: () => [0, 0, 0, 255] });

describe('readPngInfo', () => {
  it('reads the real dimensions out of the header', () => {
    expect(readPngInfo(png(240, 80))).toEqual({ width: 240, height: 80 });
    expect(readPngInfo(png(1, 1))).toEqual({ width: 1, height: 1 });
  });

  it('refuses a file that is not a PNG', () => {
    const jpegish = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]);
    expect(() => readPngInfo(jpegish)).toThrow(/not a PNG/);
    expect(() => readPngInfo(new Uint8Array())).toThrow(/not a PNG/);
  });

  it('refuses an image too big for the library', () => {
    const huge = new Uint8Array(MAX_SIGNATURE_BYTES + 1);
    huge.set(png(4, 4).subarray(0, 32));
    expect(() => readPngInfo(huge)).toThrow(/under 5 MB/);
  });

  it('names what it is complaining about', () => {
    expect(() => readPngInfo(new Uint8Array(40), 'initials image')).toThrow(/initials image/);
  });
});

describe('isPng', () => {
  it('checks the magic number, not the file name', () => {
    expect(isPng(png(2, 2))).toBe(true);
    expect(isPng(new Uint8Array(40))).toBe(false);
  });
});

describe('scaleToHeight', () => {
  it('keeps the aspect ratio of the scanned signature', () => {
    expect(scaleToHeight({ width: 240, height: 80 }, 40)).toEqual({ width: 120, height: 40 });
  });
});

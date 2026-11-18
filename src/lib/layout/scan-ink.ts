/**
 * A scanned page's picture reduced to ink and paper — one byte a pixel — which
 * is all the rule finder (scan-rules.ts) reads.
 */

export interface DarkPixels {
  width: number;
  height: number;
  /** One byte a pixel, row by row from the top: 1 where the scan is ink. */
  dark: Uint8Array;
}

/** Luminance below this is ink: a scanned hairline is grey, not black. */
const INK_BELOW = 170;

/** Ink from RGBA or RGB pixel data (`stride` bytes a pixel). */
export function darkOfColour(
  data: ArrayLike<number>,
  width: number,
  height: number,
  stride: 3 | 4
): DarkPixels {
  const dark = new Uint8Array(width * height);
  for (let pixel = 0; pixel < dark.length; pixel += 1) {
    const at = pixel * stride;
    const sum = (data[at] ?? 0) + (data[at + 1] ?? 0) + (data[at + 2] ?? 0);
    dark[pixel] = sum < 3 * INK_BELOW ? 1 : 0;
  }
  return { width, height, dark };
}

/** Ink from packed 1-bit rows, most significant bit first; `inkBit` is the bit value that prints. */
export function darkOfBits(
  data: ArrayLike<number>,
  width: number,
  height: number,
  inkBit: 0 | 1
): DarkPixels {
  const dark = new Uint8Array(width * height);
  const rowBytes = Math.ceil(width / 8);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bit = ((data[y * rowBytes + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
      dark[y * width + x] = bit === inkBit ? 1 : 0;
    }
  }
  return { width, height, dark };
}

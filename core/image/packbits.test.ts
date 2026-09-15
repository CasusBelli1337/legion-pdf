import { describe, expect, it } from 'vitest';
import { packBits, packBitsCeiling, packBitsStrip } from './packbits';

/** The spec's own decoder, written here so encode is never graded by itself. */
function unpack(data: Uint8Array): number[] {
  const out: number[] = [];
  let index = 0;
  while (index < data.length) {
    const header = data[index] ?? 0;
    index += 1;
    if (header === 128) continue;
    if (header < 128) {
      for (let run = 0; run <= header; run += 1) out.push(data[index + run] ?? 0);
      index += header + 1;
      continue;
    }
    for (let run = 0; run < 257 - header; run += 1) out.push(data[index] ?? 0);
    index += 1;
  }
  return out;
}

describe('packBits', () => {
  it('codes the example from the TIFF 6.0 specification', () => {
    const row = Uint8Array.from([
      0xaa, 0xaa, 0xaa, 0x80, 0x00, 0x2a, 0xaa, 0xaa, 0xaa, 0xaa, 0x80, 0x00, 0x2a, 0x22, 0xaa,
      0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa,
    ]);
    expect([...unpack(packBits(row))]).toEqual([...row]);
    expect(packBits(row).length).toBeLessThan(row.length);
  });

  it('round-trips runs longer than one code can hold', () => {
    const row = new Uint8Array(400).fill(7);
    const packed = packBits(row);
    expect([...unpack(packed)]).toEqual([...row]);
    // 400 identical bytes fit in four repeat codes: 128 + 128 + 128 + 16.
    expect(packed).toHaveLength(8);
  });

  it('round-trips data that never repeats', () => {
    const row = Uint8Array.from({ length: 300 }, (_unused, index) => (index * 7) % 251);
    expect([...unpack(packBits(row))]).toEqual([...row]);
    expect(packBits(row).length).toBeLessThanOrEqual(packBitsCeiling(row.length));
  });

  it('handles an empty row without producing a byte', () => {
    expect(packBits(new Uint8Array(0))).toHaveLength(0);
  });
});

describe('packBitsStrip', () => {
  it('packs each row on its own so a decoder recovers at every row boundary', () => {
    const stride = 5;
    const samples = Uint8Array.from([1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 9, 9, 9, 9, 9]);
    const packed = packBitsStrip(samples, stride, 0, 3);
    expect([...unpack(packed)]).toEqual([...samples]);
    // Row 1 and row 3 are pure runs (2 bytes each); row 2 is a 6-byte literal.
    expect(packed).toHaveLength(2 + 6 + 2);
  });

  it('packs a window in the middle of the buffer, not the whole thing', () => {
    const samples = Uint8Array.from([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([...unpack(packBitsStrip(samples, 2, 1, 2))]).toEqual([1, 1, 2, 2]);
  });
});

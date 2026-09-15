/**
 * The sizing rule is the whole behaviour worth testing: a scan that records its
 * own resolution must come out the size it was scanned at, and a picture that
 * records nothing must come out on a page a printer recognises. Every fixture is
 * a real PNG built in-test (true IHDR/IDAT/CRC), and the JPEG cases are built
 * from real JFIF header bytes, so nothing here agrees with the parser by
 * construction.
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { concatBytes, makePng, pngChunk } from '@core/ocr/png-fixture.testkit';
import { densityOf, imagesToPdf } from './image-to-pdf';

const METRES_PER_INCH = 0.0254;
/** SIGNATURE (8) + the IHDR chunk (4 + 4 + 13 + 4). pHYs goes straight after it. */
const AFTER_IHDR = 33;

function png(width: number, height: number): Uint8Array {
  return makePng({ width, height, channels: 3, paint: (x, y) => [x * 7, y * 11, 40] });
}

/** Adds a real pHYs chunk claiming a resolution in dots per inch. */
function withDensity(image: Uint8Array, dpiX: number, dpiY: number): Uint8Array {
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, Math.round(dpiX / METRES_PER_INCH));
  view.setUint32(4, Math.round(dpiY / METRES_PER_INCH));
  data[8] = 1;
  return concatBytes([
    image.subarray(0, AFTER_IHDR),
    pngChunk('pHYs', data),
    image.subarray(AFTER_IHDR),
  ]);
}

/** SOI + a real JFIF APP0 segment + EOI — enough for the density reader. */
function jfif(units: number, x: number, y: number): Uint8Array {
  const app0 = new Uint8Array(18);
  const view = new DataView(app0.buffer);
  app0.set([0xff, 0xd8, 0xff, 0xe0]);
  view.setUint16(4, 16);
  app0.set(new TextEncoder().encode('JFIF\0'), 6);
  app0[11] = 1;
  app0[12] = 1;
  app0[13] = units;
  view.setUint16(14, x);
  view.setUint16(16, y);
  return concatBytes([app0, Uint8Array.from([0xff, 0xd9])]);
}

async function pageSizes(bytes: Uint8Array): Promise<{ width: number; height: number }[]> {
  const document = await PDFDocument.load(bytes);
  return document.getPages().map((page) => page.getSize());
}

describe('imagesToPdf', () => {
  it('makes one page per picture and proves the count', async () => {
    const result = await imagesToPdf([
      { name: 'scan-1.png', bytes: png(40, 60) },
      { name: 'scan-2.png', bytes: png(40, 60) },
      { name: 'scan-3.png', bytes: png(40, 60) },
    ]);

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(3);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(await pageSizes(result.bytes)).toHaveLength(3);
  });

  it('reports progress once per picture', async () => {
    const seen: [number, number][] = [];
    await imagesToPdf(
      [
        { name: 'a.png', bytes: png(10, 10) },
        { name: 'b.png', bytes: png(10, 10) },
      ],
      (current, total) => seen.push([current, total])
    );

    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('gives a 300 DPI scan a page its own size', async () => {
    const result = await imagesToPdf([
      { name: 'letter.png', bytes: withDensity(png(600, 900), 300, 300) },
    ]);

    const [size] = await pageSizes(result.bytes);
    // 600 px / 300 dpi = 2 inches = 144 points; 900 / 300 = 3 inches = 216.
    expect(size?.width).toBeCloseTo(144, 1);
    expect(size?.height).toBeCloseTo(216, 1);
    expect(result.detail.sizedByDensity).toEqual(['letter.png']);
  });

  it('honours a density passed in, for pages re-encoded on the way here', async () => {
    const result = await imagesToPdf([
      { name: 'fax page 1', bytes: png(400, 600), density: { x: 200, y: 200 } },
    ]);

    const [size] = await pageSizes(result.bytes);
    expect(size?.width).toBeCloseTo(144, 3);
    expect(size?.height).toBeCloseTo(216, 3);
  });

  it('fits a picture with no recorded resolution onto a Letter page', async () => {
    const result = await imagesToPdf([{ name: 'screenshot.png', bytes: png(800, 400) }]);

    expect(await pageSizes(result.bytes)).toEqual([{ width: 612, height: 792 }]);
    expect(result.detail.sizedByDensity).toEqual([]);
  });

  it('falls back to Letter when the recorded resolution is absurd', async () => {
    // 600 px at 1 DPI would be a 50-foot page; the PDF format stops at 200 inches.
    const result = await imagesToPdf([
      { name: 'broken.png', bytes: withDensity(png(600, 900), 1, 1) },
    ]);

    expect(await pageSizes(result.bytes)).toEqual([{ width: 612, height: 792 }]);
    expect(result.detail.sizedByDensity).toEqual([]);
  });

  it('refuses an empty list rather than writing a 0-page PDF', async () => {
    await expect(imagesToPdf([])).rejects.toThrow(/no pictures/i);
  });

  it('refuses a 0-byte file by name', async () => {
    await expect(imagesToPdf([{ name: 'empty.png', bytes: new Uint8Array(0) }])).rejects.toThrow(
      /empty\.png is empty/i
    );
  });

  it('refuses a file that is not a PNG or JPEG', async () => {
    await expect(
      imagesToPdf([{ name: 'notes.txt', bytes: new TextEncoder().encode('hello') }])
    ).rejects.toThrow(/not a PNG or JPEG/i);
  });
});

describe('densityOf', () => {
  it('reads pixels-per-metre out of a PNG pHYs chunk', () => {
    const density = densityOf(withDensity(png(8, 8), 150, 300));
    expect(density?.x).toBeCloseTo(150, 1);
    expect(density?.y).toBeCloseTo(300, 1);
  });

  it('says nothing when a PNG records nothing', () => {
    expect(densityOf(png(8, 8))).toBeNull();
  });

  it('reads JFIF dots per inch', () => {
    expect(densityOf(jfif(1, 300, 300))).toEqual({ x: 300, y: 300 });
  });

  it('converts JFIF dots per centimetre', () => {
    const density = densityOf(jfif(2, 100, 100));
    expect(density?.x).toBeCloseTo(254, 6);
  });

  it('ignores a JFIF aspect-ratio-only density', () => {
    expect(densityOf(jfif(0, 1, 1))).toBeNull();
  });
});

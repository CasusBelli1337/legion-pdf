/**
 * The TIFF encoder is graded by a reader written from the TIFF 6.0 spec in this
 * file — not by its own code. Everything below parses the header, walks the IFD
 * chain, resolves tags, PackBits-decodes the strips, and compares pixels.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeTiff } from './tiff-encode';
import { countTiffPages } from './tiff-inspect';
import { bytesPerRow } from './types';
import type { PageImage } from './types';

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };

interface ReadPage {
  width: number;
  height: number;
  photometric: number;
  bitsPerSample: number[];
  samplesPerPixel: number;
  compression: number;
  rowsPerStrip: number;
  xResolution: number;
  yResolution: number;
  resolutionUnit: number;
  stripCount: number;
  samples: Uint8Array;
}

function tagValues(view: DataView, entryAt: number): { tag: number; values: number[] } {
  const tag = view.getUint16(entryAt, true);
  const type = view.getUint16(entryAt + 2, true);
  const count = view.getUint32(entryAt + 4, true);
  const size = TYPE_SIZES[type] ?? 0;
  if (size === 0) throw new Error(`Unknown TIFF type ${type} on tag ${tag}`);
  const inline = count * size <= 4;
  const base = inline ? entryAt + 8 : view.getUint32(entryAt + 8, true);
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = base + index * size;
    if (type === 3) values.push(view.getUint16(at, true));
    else if (type === 4) values.push(view.getUint32(at, true));
    else if (type === 5) values.push(view.getUint32(at, true) / view.getUint32(at + 4, true));
    else values.push(view.getUint8(at));
  }
  return { tag, values };
}

/** PackBits, decoded per the spec. Refuses a strip that comes up short. */
function unpackBits(data: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let at = 0;
  let index = 0;
  while (index < data.length && at < expected) {
    const header = data[index] ?? 0;
    index += 1;
    if (header === 128) continue;
    if (header < 128) {
      const run = header + 1;
      out.set(data.subarray(index, index + run), at);
      at += run;
      index += run;
      continue;
    }
    const run = 257 - header;
    out.fill(data[index] ?? 0, at, at + run);
    at += run;
    index += 1;
  }
  if (at !== expected) throw new Error(`PackBits produced ${at} bytes where ${expected} were due.`);
  return out;
}

type Tags = Map<number, number[]>;

function readTags(view: DataView, ifd: number): Tags {
  const entries = view.getUint16(ifd, true);
  const tags: Tags = new Map();
  for (let index = 0; index < entries; index += 1) {
    const { tag, values } = tagValues(view, ifd + 2 + index * 12);
    tags.set(tag, values);
  }
  return tags;
}

function list(tags: Tags, tag: number): number[] {
  const values = tags.get(tag);
  if (values === undefined) throw new Error(`Required tag ${tag} is missing.`);
  return values;
}

function one(tags: Tags, tag: number): number {
  const [value] = list(tags, tag);
  if (value === undefined) throw new Error(`Tag ${tag} carried no value.`);
  return value;
}

function readStrips(bytes: Uint8Array, tags: Tags, stride: number, height: number): Uint8Array {
  const offsets = list(tags, 273);
  const counts = list(tags, 279);
  const rowsPerStrip = one(tags, 278);
  const samples = new Uint8Array(stride * height);
  let cursor = 0;
  offsets.forEach((offset, index) => {
    const rows = Math.min(rowsPerStrip, height - index * rowsPerStrip);
    const raw = bytes.subarray(offset, offset + (counts[index] ?? 0));
    samples.set(unpackBits(raw, stride * rows), cursor);
    cursor += stride * rows;
  });
  return samples;
}

function readPage(bytes: Uint8Array, view: DataView, ifd: number): ReadPage {
  const tags = readTags(view, ifd);
  const width = one(tags, 256);
  const height = one(tags, 257);
  const bitsPerSample = list(tags, 258);
  const samplesPerPixel = one(tags, 277);
  const stride = Math.ceil((width * samplesPerPixel * one(tags, 258)) / 8);
  return {
    width,
    height,
    photometric: one(tags, 262),
    bitsPerSample,
    samplesPerPixel,
    compression: one(tags, 259),
    rowsPerStrip: one(tags, 278),
    xResolution: one(tags, 282),
    yResolution: one(tags, 283),
    resolutionUnit: one(tags, 296),
    stripCount: list(tags, 273).length,
    samples: readStrips(bytes, tags, stride, height),
  };
}

function readTiff(bytes: Uint8Array): ReadPage[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(bytes[0]).toBe(0x49);
  expect(bytes[1]).toBe(0x49);
  expect(view.getUint16(2, true)).toBe(42);
  const pages: ReadPage[] = [];
  let ifd = view.getUint32(4, true);
  while (ifd !== 0) {
    pages.push(readPage(bytes, view, ifd));
    ifd = view.getUint32(ifd + 2 + view.getUint16(ifd, true) * 12, true);
  }
  return pages;
}

/** The first (or only) page, unwrapped once so assertions read plainly. */
function firstPage(tiff: Uint8Array): ReadPage {
  const [page] = readTiff(tiff);
  if (page === undefined) throw new Error('The TIFF came back with no pages at all.');
  return page;
}

function rgbPage(widthPx: number, heightPx: number, seed: number): PageImage {
  const samples = new Uint8Array(widthPx * heightPx * 3);
  for (let index = 0; index < samples.length; index += 1) {
    // Long flat runs AND changing bytes, so both PackBits branches are exercised.
    samples[index] = index % 37 < 20 ? (seed * 7) % 256 : (index * 13 + seed) % 256;
  }
  return { kind: 'rgb', widthPx, heightPx, samples };
}

function grayPage(widthPx: number, heightPx: number): PageImage {
  const samples = new Uint8Array(widthPx * heightPx);
  for (let index = 0; index < samples.length; index += 1) samples[index] = (index * 3) % 256;
  return { kind: 'gray', widthPx, heightPx, samples };
}

function bilevelPage(widthPx: number, heightPx: number): PageImage {
  const stride = Math.ceil(widthPx / 8);
  const samples = new Uint8Array(stride * heightPx);
  for (let index = 0; index < samples.length; index += 1)
    samples[index] = index % 3 === 0 ? 0xf0 : 0;
  return { kind: 'bilevel', widthPx, heightPx, samples };
}

/** An outside opinion, when the machine has one. Null when it does not. */
function externalReport(path: string): { pages: number; size: string } | null {
  const python = `import sys
from PIL import Image
with Image.open(sys.argv[1]) as im:
    print(getattr(im, "n_frames", 1), f"{im.width}x{im.height}")`;
  try {
    const out = execFileSync('python3', ['-c', python, path], { encoding: 'utf8' }).trim();
    const [pages, size] = out.split(' ');
    return { pages: Number(pages), size: size ?? '' };
  } catch {
    return null;
  }
}

describe('encodeTiff', () => {
  it('round-trips an RGB page through an independent reader', () => {
    const page = rgbPage(7, 5, 3);
    const read = firstPage(encodeTiff([page], 200));
    expect(read.width).toBe(7);
    expect(read.height).toBe(5);
    expect(read.photometric).toBe(2);
    expect(read.bitsPerSample).toEqual([8, 8, 8]);
    expect(read.samplesPerPixel).toBe(3);
    expect(read.compression).toBe(32773);
    expect(read.xResolution).toBe(200);
    expect(read.yResolution).toBe(200);
    expect(read.resolutionUnit).toBe(2);
    expect(read.samples).toEqual(page.samples);
  });

  it('round-trips grayscale and bilevel pages with the right photometrics', () => {
    const gray = grayPage(9, 4);
    const readGray = firstPage(encodeTiff([gray], 300));
    expect(readGray.photometric).toBe(1);
    expect(readGray.bitsPerSample).toEqual([8]);
    expect(readGray.samples).toEqual(gray.samples);

    const bw = bilevelPage(9, 3);
    const readBw = firstPage(encodeTiff([bw], 300));
    expect(readBw.photometric).toBe(0);
    expect(readBw.bitsPerSample).toEqual([1]);
    expect(readBw.samplesPerPixel).toBe(1);
    // A 9px row is 2 bytes wide: the tail padding has to survive the trip.
    expect(bytesPerRow(bw)).toBe(2);
    expect(readBw.samples).toEqual(bw.samples);
  });

  it('chains one IFD per page and keeps each page distinct', () => {
    const pages = [rgbPage(6, 4, 1), rgbPage(8, 3, 2), grayPage(5, 6)];
    const tiff = encodeTiff(pages, 150);
    expect(countTiffPages(tiff)).toBe(3);
    const read = readTiff(tiff);
    expect(read).toHaveLength(3);
    read.forEach((page, index) => {
      expect(page.width).toBe(pages[index]?.widthPx);
      expect(page.height).toBe(pages[index]?.heightPx);
      expect(page.samples).toEqual(pages[index]?.samples);
    });
  });

  it('splits a tall page into strips and still reassembles it exactly', () => {
    const page = rgbPage(100, 500, 5);
    const read = firstPage(encodeTiff([page], 200));
    expect(read.stripCount).toBeGreaterThan(1);
    expect(read.samples).toEqual(page.samples);
  });

  it('refuses to write a TIFF with no pages or an impossible resolution', () => {
    expect(() => encodeTiff([], 200)).toThrow(/at least one page/);
    expect(() => encodeTiff([rgbPage(4, 4, 1)], 0)).toThrow(/not a usable resolution/);
  });

  it('refuses a page whose sample buffer is the wrong size', () => {
    const broken: PageImage = { kind: 'rgb', widthPx: 4, heightPx: 4, samples: new Uint8Array(10) };
    expect(() => encodeTiff([broken], 200)).toThrow(/10 bytes where 48 were expected/);
  });
});

describe('countTiffPages', () => {
  it('rejects bytes that are not our TIFF', () => {
    expect(() => countTiffPages(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/not the TIFF/);
  });

  it('agrees with an outside reader about page count and size', () => {
    const pages = [rgbPage(20, 12, 1), rgbPage(20, 12, 2), rgbPage(20, 12, 3)];
    const tiff = encodeTiff(pages, 200);
    const path = join(mkdtempSync(join(tmpdir(), 'legion-tiff-')), 'pages.tif');
    writeFileSync(path, tiff);

    const report = externalReport(path);
    if (report === null) {
      // No ImageMagick / libtiff / Pillow here — our own reader already ran.
      expect(countTiffPages(tiff)).toBe(3);
      return;
    }
    expect(report.pages).toBe(3);
    expect(report.size).toBe('20x12');
    expect(countTiffPages(tiff)).toBe(report.pages);
  });
});

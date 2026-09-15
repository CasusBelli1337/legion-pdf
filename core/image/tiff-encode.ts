/**
 * Baseline TIFF 6.0 writer — one file, every page, chained IFDs.
 *
 * WHY hand-written: litigation productions and court e-filing portals ask for a
 * SINGLE multi-page TIFF, and every JS TIFF package either writes one page per
 * file or pulls in a native build we cannot ship inside an Electron installer.
 * Baseline TIFF is a header, a tag table per page, and strips of PackBits — the
 * whole format we need is below, and the tests decode it with their own reader
 * rather than trusting this file to grade itself.
 *
 * Little-endian ("II"), PackBits compression, strips of roughly 64 KB, and the
 * resolution tags filled in so a page opens at the size it was exported at.
 */

import { packBitsStrip } from './packbits';
import { assertImage, bitsPerSample, bytesPerRow, samplesPerPixel } from './types';
import type { ImageKind, PageImage } from './types';

const HEADER_BYTES = 8;
const ENTRY_COUNT = 13;
/** entry count + entries + the offset of the next page's tag table. */
const IFD_BYTES = 2 + ENTRY_COUNT * 12 + 4;
const STRIP_TARGET_BYTES = 64 * 1024;

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

const COMPRESSION_PACKBITS = 32773;
const RESOLUTION_UNIT_INCH = 2;
/** Bit 1 of NewSubfileType: "this is one page of a multi-page image". */
const SUBFILE_PAGE_OF_MANY = 2;

/**
 * RGB is 2; grayscale is 1 (BlackIsZero, 0 = black); bilevel is 0 (WhiteIsZero,
 * a SET bit = black ink) — the fax convention every bitonal production uses.
 */
const PHOTOMETRIC: Record<ImageKind, number> = { rgb: 2, gray: 1, bilevel: 0 };

/**
 * A page already compressed, holding only its strips. Pages are prepared ONE AT
 * A TIME so a 500-page colour export never has 500 raw rasters in memory at
 * once — the raw page is dropped as soon as its strips exist.
 */
export interface PreparedTiffPage {
  kind: ImageKind;
  widthPx: number;
  heightPx: number;
  strips: Uint8Array[];
  rowsPerStrip: number;
}

interface ExtraOffsets {
  bitsPerSample: number;
  stripOffsets: number;
  stripByteCounts: number;
  xResolution: number;
  yResolution: number;
}

interface PageBlock {
  page: PreparedTiffPage;
  base: number;
  extras: ExtraOffsets;
  stripsStart: number;
  /** Bytes this page occupies, padded to the even boundary TIFF wants. */
  size: number;
}

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** The value itself when it fits in four bytes, otherwise where it lives. */
  value: number;
}

/** Compress one page into strips. The raster can be discarded afterwards. */
export function prepareTiffPage(image: PageImage): PreparedTiffPage {
  assertImage(image, 'A page on its way into the TIFF');
  const stride = bytesPerRow(image);
  const perStrip = Math.max(1, Math.floor(STRIP_TARGET_BYTES / stride));
  const rowsPerStrip = Math.min(image.heightPx, perStrip);
  const strips: Uint8Array[] = [];
  for (let row = 0; row < image.heightPx; row += rowsPerStrip) {
    const rows = Math.min(rowsPerStrip, image.heightPx - row);
    strips.push(packBitsStrip(image.samples, stride, row, rows));
  }
  const { kind, widthPx, heightPx } = image;
  return { kind, widthPx, heightPx, strips, rowsPerStrip };
}

function blockFor(page: PreparedTiffPage, base: number): PageBlock {
  const stripCount = page.strips.length;
  let cursor = base + IFD_BYTES;
  const take = (bytes: number): number => {
    const at = cursor;
    cursor += bytes;
    return at;
  };
  const extras: ExtraOffsets = {
    bitsPerSample: page.kind === 'rgb' ? take(6) : 0,
    stripOffsets: stripCount > 1 ? take(4 * stripCount) : 0,
    stripByteCounts: stripCount > 1 ? take(4 * stripCount) : 0,
    xResolution: take(8),
    yResolution: take(8),
  };
  const stripsStart = cursor;
  const end = stripsStart + page.strips.reduce((sum, strip) => sum + strip.length, 0);
  return { page, base, extras, stripsStart, size: end + (end % 2) - base };
}

function entriesFor(block: PageBlock, multiPage: boolean): Entry[] {
  const { kind, widthPx, heightPx, strips, rowsPerStrip } = block.page;
  const single = strips.length === 1;
  return [
    { tag: 254, type: LONG, count: 1, value: multiPage ? SUBFILE_PAGE_OF_MANY : 0 },
    { tag: 256, type: LONG, count: 1, value: widthPx },
    { tag: 257, type: LONG, count: 1, value: heightPx },
    {
      tag: 258,
      type: SHORT,
      count: samplesPerPixel(kind),
      value: kind === 'rgb' ? block.extras.bitsPerSample : bitsPerSample(kind),
    },
    { tag: 259, type: SHORT, count: 1, value: COMPRESSION_PACKBITS },
    { tag: 262, type: SHORT, count: 1, value: PHOTOMETRIC[kind] },
    {
      tag: 273,
      type: LONG,
      count: strips.length,
      value: single ? block.stripsStart : block.extras.stripOffsets,
    },
    { tag: 277, type: SHORT, count: 1, value: samplesPerPixel(kind) },
    { tag: 278, type: LONG, count: 1, value: rowsPerStrip },
    {
      tag: 279,
      type: LONG,
      count: strips.length,
      value: single ? (strips[0]?.length ?? 0) : block.extras.stripByteCounts,
    },
    { tag: 282, type: RATIONAL, count: 1, value: block.extras.xResolution },
    { tag: 283, type: RATIONAL, count: 1, value: block.extras.yResolution },
    { tag: 296, type: SHORT, count: 1, value: RESOLUTION_UNIT_INCH },
  ];
}

function writeEntry(view: DataView, at: number, entry: Entry): void {
  view.setUint16(at, entry.tag, true);
  view.setUint16(at + 2, entry.type, true);
  view.setUint32(at + 4, entry.count, true);
  view.setUint32(at + 8, entry.value, true);
}

function writeRational(view: DataView, at: number, numerator: number): void {
  view.setUint32(at, numerator, true);
  view.setUint32(at + 4, 1, true);
}

function writeExtras(view: DataView, block: PageBlock, dpi: number): void {
  if (block.page.kind === 'rgb') {
    for (let channel = 0; channel < 3; channel += 1) {
      view.setUint16(block.extras.bitsPerSample + channel * 2, 8, true);
    }
  }
  writeRational(view, block.extras.xResolution, dpi);
  writeRational(view, block.extras.yResolution, dpi);
}

/** Strip bytes, plus the offset/length tables when a page has more than one. */
function writeStrips(out: Uint8Array, view: DataView, block: PageBlock): void {
  const many = block.page.strips.length > 1;
  let cursor = block.stripsStart;
  block.page.strips.forEach((strip, index) => {
    out.set(strip, cursor);
    if (many) {
      view.setUint32(block.extras.stripOffsets + index * 4, cursor, true);
      view.setUint32(block.extras.stripByteCounts + index * 4, strip.length, true);
    }
    cursor += strip.length;
  });
}

function writePage(
  out: Uint8Array,
  view: DataView,
  block: PageBlock,
  nextIfd: number,
  options: { multiPage: boolean; dpi: number }
): void {
  view.setUint16(block.base, ENTRY_COUNT, true);
  entriesFor(block, options.multiPage).forEach((entry, index) => {
    writeEntry(view, block.base + 2 + index * 12, entry);
  });
  view.setUint32(block.base + 2 + ENTRY_COUNT * 12, nextIfd, true);
  writeExtras(view, block, options.dpi);
  writeStrips(out, view, block);
}

/** One multi-page TIFF from pages already compressed by `prepareTiffPage`. */
export function encodeTiffPages(pages: readonly PreparedTiffPage[], dpi: number): Uint8Array {
  if (pages.length === 0) throw new RangeError('A TIFF needs at least one page; none were given.');
  if (!Number.isFinite(dpi) || dpi <= 0) throw new RangeError(`${dpi} is not a usable resolution.`);

  const blocks: PageBlock[] = [];
  let base = HEADER_BYTES;
  for (const page of pages) {
    const block = blockFor(page, base);
    blocks.push(block);
    base += block.size;
  }

  const out = new Uint8Array(base);
  const view = new DataView(out.buffer);
  out[0] = 0x49;
  out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, HEADER_BYTES, true);

  const options = { multiPage: pages.length > 1, dpi };
  blocks.forEach((block, index) => {
    const next = blocks[index + 1];
    writePage(out, view, block, next === undefined ? 0 : next.base, options);
  });
  return out;
}

/** The whole job in one call — what the tests and small exports use. */
export function encodeTiff(pages: readonly PageImage[], dpi: number): Uint8Array {
  return encodeTiffPages(pages.map(prepareTiffPage), dpi);
}

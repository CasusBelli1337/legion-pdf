/**
 * Pictures into pages — one page per image, in the order they were handed over.
 *
 * The page size is the whole question. A scan carries its own resolution (PNG
 * pHYs, JPEG JFIF density), and honouring it is what makes a 300 DPI scan of a
 * letter come out 8.5 x 11 instead of an arbitrary rectangle. A screenshot
 * usually carries nothing, so there is no honest natural size and the picture is
 * fitted to a Letter page instead — predictable, and the size an attorney's
 * printer expects.
 *
 * Only PNG and JPEG are embedded directly, because those are the only two
 * formats a PDF can carry without re-encoding. Everything else (TIFF, BMP, GIF,
 * WebP) is decoded to PNG upstream and arrives here with its density passed in.
 */

import type { OpResult, PageSize } from '@shared/types';
import { createPdf, finish, type ProgressReporter } from './pdf-io';

/** Dots per inch, as the file itself records them. */
export interface ImageDensity {
  x: number;
  y: number;
}

export interface PdfImageSource {
  /** The file this picture came from, for error messages. */
  name: string;
  bytes: Uint8Array;
  /**
   * Overrides what the bytes record. Re-encoded pages (a TIFF page written back
   * out as PNG) lose their resolution in the round trip, so the decoder passes
   * the original's density through here rather than letting it evaporate.
   */
  density?: ImageDensity;
}

export interface ImagePdfDetail {
  /** The page built for each image, in PDF points — the sizing rule, proven. */
  pageSizes: PageSize[];
  /** Images whose own recorded DPI set their page size (the rest were fitted). */
  sizedByDensity: string[];
}

const LETTER: PageSize = { width: 612, height: 792 };
/** Under this a "page" is a postage stamp; over it is past the PDF format's ceiling. */
const MIN_SIDE_POINTS = 3;
const MAX_SIDE_POINTS = 14400;
const POINTS_PER_INCH = 72;
const METRES_PER_INCH = 0.0254;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

/** pHYs holds pixels per unit; unit 1 is the metre, and nothing else is defined. */
function pngDensity(png: Uint8Array): ImageDensity | null {
  const decoder = new TextDecoder('latin1');
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = readUint32(png, offset);
    const type = decoder.decode(png.subarray(offset + 4, offset + 8));
    if (type === 'pHYs' && length === 9 && png[offset + 16] === 1) {
      return {
        x: readUint32(png, offset + 8) * METRES_PER_INCH,
        y: readUint32(png, offset + 12) * METRES_PER_INCH,
      };
    }
    if (type === 'IEND') break;
    offset += length + 12;
  }
  return null;
}

/** JFIF APP0: units 1 = dots per inch, 2 = dots per centimetre, 0 = aspect only. */
function jfifDensity(jpeg: Uint8Array, at: number): ImageDensity | null {
  const units = jpeg[at + 11];
  const x = readUint16(jpeg, at + 12);
  const y = readUint16(jpeg, at + 14);
  if (x <= 0 || y <= 0) return null;
  if (units === 1) return { x, y };
  if (units === 2) return { x: x * 2.54, y: y * 2.54 };
  return null;
}

function jpegDensity(jpeg: Uint8Array): ImageDensity | null {
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) return null;
    const marker = jpeg[offset + 1] ?? 0;
    const length = readUint16(jpeg, offset + 2);
    // Start of scan: pixel data from here on, no more headers to read.
    if (marker === 0xda) return null;
    if (marker === 0xe0 && length >= 16) return jfifDensity(jpeg, offset);
    offset += 2 + length;
  }
  return null;
}

/** What the file itself says its resolution is, or null when it says nothing. */
export function densityOf(bytes: Uint8Array): ImageDensity | null {
  const found = isPng(bytes) ? pngDensity(bytes) : isJpeg(bytes) ? jpegDensity(bytes) : null;
  if (found === null) return null;
  return Number.isFinite(found.x) && Number.isFinite(found.y) && found.x > 0 && found.y > 0
    ? found
    : null;
}

/** The page an image asks for at its own resolution; null when it cannot ask. */
function naturalPage(
  widthPx: number,
  heightPx: number,
  density: ImageDensity | null
): PageSize | null {
  if (density === null) return null;
  const size = {
    width: (widthPx / density.x) * POINTS_PER_INCH,
    height: (heightPx / density.y) * POINTS_PER_INCH,
  };
  const sane = [size.width, size.height].every(
    (side) => Number.isFinite(side) && side >= MIN_SIDE_POINTS && side <= MAX_SIDE_POINTS
  );
  return sane ? size : null;
}

/** Biggest the picture can be on a Letter page without distorting it. */
function fitToLetter(widthPx: number, heightPx: number): PageSize {
  const scale = Math.min(LETTER.width / widthPx, LETTER.height / heightPx);
  return { width: widthPx * scale, height: heightPx * scale };
}

/**
 * One page per image. `pagesIn` counts the pictures handed over, so a caller
 * comparing it with `pagesOut` is checking that no picture was dropped.
 */
export async function imagesToPdf(
  images: readonly PdfImageSource[],
  report?: ProgressReporter
): Promise<OpResult<ImagePdfDetail>> {
  if (images.length === 0) {
    throw new RangeError('There are no pictures to turn into a PDF.');
  }
  const document = await createPdf();
  const detail: ImagePdfDetail = { pageSizes: [], sizedByDensity: [] };
  for (const [index, source] of images.entries()) {
    await addImagePage(document, source, detail);
    report?.(index + 1, images.length);
  }
  return finish(document, images.length, images.length, detail, 'picture PDF');
}

type PdfDocument = Awaited<ReturnType<typeof createPdf>>;

async function addImagePage(
  document: PdfDocument,
  source: PdfImageSource,
  detail: ImagePdfDetail
): Promise<void> {
  const embedded = await embed(document, source);
  const natural = naturalPage(
    embedded.width,
    embedded.height,
    source.density ?? densityOf(source.bytes)
  );
  if (natural !== null) {
    const page = document.addPage([natural.width, natural.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: natural.width, height: natural.height });
    detail.pageSizes.push(natural);
    detail.sizedByDensity.push(source.name);
    return;
  }
  const page = document.addPage([LETTER.width, LETTER.height]);
  const box = fitToLetter(embedded.width, embedded.height);
  page.drawImage(embedded, {
    x: (LETTER.width - box.width) / 2,
    y: (LETTER.height - box.height) / 2,
    width: box.width,
    height: box.height,
  });
  detail.pageSizes.push({ ...LETTER });
}

function embed(document: PdfDocument, source: PdfImageSource) {
  if (source.bytes.byteLength === 0) {
    throw new RangeError(`${source.name} is empty (0 bytes) — there is no picture in it.`);
  }
  if (isPng(source.bytes)) return document.embedPng(source.bytes);
  if (isJpeg(source.bytes)) return document.embedJpg(source.bytes);
  throw new RangeError(
    `${source.name} is not a PNG or JPEG picture, so it cannot be placed on a page directly.`
  );
}

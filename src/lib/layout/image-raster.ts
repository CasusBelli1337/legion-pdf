/**
 * A decoded pdfjs image → PNG bytes, on the renderer's canvas. pdfjs hands
 * images over in two shapes: an ImageBitmap when the browser decoded them, or
 * raw pixel data (1-bit grey, RGB, or RGBA) when it did the work itself. Both
 * end up drawn onto an OffscreenCanvas, which is the one encoder every zone
 * agrees on.
 */

import type { RasterizedImage } from './extract-page-layout';
import { darkOfColour } from './scan-ink';
import { isPageSized, scanRulesOf } from './scan-rules';

/** pdfjs' ImageKind values. */
const GRAYSCALE_1BPP = 1;
const RGB_24BPP = 2;

interface PixelImage {
  width: number;
  height: number;
  kind?: number;
  data?: ArrayLike<number>;
  bitmap?: unknown;
}

function isPixelImage(value: unknown): value is PixelImage {
  if (typeof value !== 'object' || value === null) return false;
  const image = value as PixelImage;
  return typeof image.width === 'number' && typeof image.height === 'number';
}

function rgbToRgba(data: ArrayLike<number>, pixels: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    rgba[pixel * 4] = data[pixel * 3] ?? 0;
    rgba[pixel * 4 + 1] = data[pixel * 3 + 1] ?? 0;
    rgba[pixel * 4 + 2] = data[pixel * 3 + 2] ?? 0;
    rgba[pixel * 4 + 3] = 255;
  }
  return rgba;
}

/** Packed 1-bit rows, most significant bit first, 1 = white. */
function bitsToRgba(data: ArrayLike<number>, width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const rowBytes = Math.ceil(width / 8);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bit = ((data[y * rowBytes + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
      const value = bit === 1 ? 255 : 0;
      rgba.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return rgba;
}

function expandToRgba(image: PixelImage): Uint8ClampedArray | null {
  const { width, height, data, kind } = image;
  if (data === undefined) return null;
  if (kind === RGB_24BPP) return rgbToRgba(data, width * height);
  if (kind === GRAYSCALE_1BPP) return bitsToRgba(data, width, height);
  if (data.length === width * height * 4) return new Uint8ClampedArray(data);
  return null;
}

async function toPng(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** True for an image `rasterizeImageObject` can draw: the two must never disagree about a page. */
function readable(value: unknown): value is PixelImage {
  if (!isPixelImage(value) || value.width < 1 || value.height < 1) return false;
  if (value.bitmap !== undefined && value.bitmap !== null) return true;
  const { data, kind, width, height } = value;
  if (data === undefined) return false;
  return kind === RGB_24BPP || kind === GRAYSCALE_1BPP || data.length === width * height * 4;
}

/**
 * The image's size without its pixels, for a reader that only needs to know a
 * picture is there (the export preview). Answers null exactly when
 * `rasterizeImageObject` would.
 */
export function measureImageObject(value: unknown): Promise<RasterizedImage | null> {
  return Promise.resolve(
    readable(value)
      ? { png: new Uint8Array(0), widthPx: value.width, heightPx: value.height }
      : null
  );
}

/** PNG bytes for a pdfjs image object, or null when it is not one this can read. */
export async function rasterizeImageObject(value: unknown): Promise<RasterizedImage | null> {
  if (!readable(value)) return null;
  const canvas = new OffscreenCanvas(value.width, value.height);
  const context = canvas.getContext('2d');
  if (context === null) return null;
  if (value.bitmap !== undefined && value.bitmap !== null) {
    context.drawImage(value.bitmap as CanvasImageSource, 0, 0);
  } else {
    const rgba = expandToRgba(value);
    if (rgba === null) return null;
    const pixels = new ImageData(value.width, value.height);
    pixels.data.set(rgba);
    context.putImageData(pixels, 0, 0);
  }
  const { width, height } = value;
  const png = await toPng(canvas);
  if (!isPageSized(width, height)) return { png, widthPx: width, heightPx: height };
  const drawn = context.getImageData(0, 0, width, height).data;
  const rules = scanRulesOf(darkOfColour(drawn, width, height, 4));
  return { png, widthPx: width, heightPx: height, rules };
}

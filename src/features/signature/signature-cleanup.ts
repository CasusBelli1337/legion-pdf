/**
 * Turning a photographed or scanned signature into pen strokes on nothing.
 *
 * Attorneys sign a sheet of paper and photograph it with a phone. What comes
 * back is grey, yellow, or blue-ish paper, lit unevenly, with a shadow down one
 * side — and dropped on a page as-is it lands as a rectangle of paper sitting
 * on top of the document. This is the pipeline that keeps the ink and throws
 * the paper away:
 *
 *   grayscale (over white) → estimate the paper's own brightness at every point
 *   → ink = how much darker than its local paper → Otsu threshold → drop the
 *   specks → alpha from ink strength, pen colour kept.
 *
 * The paper estimate is a LOCAL mean, not a global one, which is what makes it
 * survive uneven light: a stroke in the shadowed corner is still much darker
 * than the shadow around it, even though it is brighter than the lit paper on
 * the other side of the page. Everything here is pure arithmetic over pixel
 * buffers — no canvas, no DOM — so it is tested on synthetic scans in Node.
 */

import { dropSpecks, minSpeckArea } from './signature-despeckle';

/**
 * A raw RGBA image: exactly the shape of a canvas `ImageData`. The buffer is
 * pinned to a plain ArrayBuffer because that is what `new ImageData(...)`
 * accepts — a shared buffer is not a thing a canvas will take back.
 */
export interface Pixels {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

/** 0 keeps only the darkest ink; 100 keeps the faintest. 50 is the estimate. */
export const DEFAULT_SENSITIVITY = 50;

/** Below this, "ink" is scanner noise. Stops Otsu inventing strokes on a blank. */
const MIN_INK = 18;

/** Ink this much above the threshold is fully opaque; the rest ramps in. */
const FULL_INK_FACTOR = 1.5;

/**
 * Radius of the paper estimate, in pixels. Wide enough that a pen stroke cannot
 * drag its own neighbourhood down with it (which would erase the middle of a
 * thick stroke), narrow enough to follow real shading.
 */
export function backgroundRadius(width: number, height: number): number {
  return Math.max(8, Math.round(Math.max(width, height) / 8));
}

/**
 * Luminance, composited over white first: a PNG that already has transparency
 * must read as paper where it is transparent, not as black.
 */
export function toGrayscale({ data, width, height }: Pixels): Float32Array {
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    const alpha = (data[offset + 3] ?? 0) / 255;
    const red = (data[offset] ?? 0) * alpha + 255 * (1 - alpha);
    const green = (data[offset + 1] ?? 0) * alpha + 255 * (1 - alpha);
    const blue = (data[offset + 2] ?? 0) * alpha + 255 * (1 - alpha);
    gray[index] = 0.299 * red + 0.587 * green + 0.114 * blue;
  }
  return gray;
}

/** Summed-area table, so the box mean below costs the same at any radius. */
function integralOf(gray: Float32Array, width: number, height: number): Float64Array {
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const above = sums[y * (width + 1) + x + 1] ?? 0;
      const left = sums[(y + 1) * (width + 1) + x] ?? 0;
      const diagonal = sums[y * (width + 1) + x] ?? 0;
      sums[(y + 1) * (width + 1) + x + 1] = (gray[y * width + x] ?? 0) + above + left - diagonal;
    }
  }
  return sums;
}

/** The paper's brightness under every pixel: the mean of the box around it. */
export function localMean(
  gray: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  const sums = integralOf(gray, width, height);
  const mean = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const total =
        (sums[bottom * (width + 1) + right] ?? 0) -
        (sums[top * (width + 1) + right] ?? 0) -
        (sums[bottom * (width + 1) + left] ?? 0) +
        (sums[top * (width + 1) + left] ?? 0);
      mean[y * width + x] = total / ((bottom - top) * (right - left));
    }
  }
  return mean;
}

/** How much darker than its own local paper each pixel is, clamped to 0–255. */
export function inkMap(gray: Float32Array, paper: Float32Array): Float32Array {
  const ink = new Float32Array(gray.length);
  for (let index = 0; index < ink.length; index += 1) {
    ink[index] = Math.min(255, Math.max(0, (paper[index] ?? 0) - (gray[index] ?? 0)));
  }
  return ink;
}

function histogramOf(ink: Float32Array): Float64Array {
  const histogram = new Float64Array(256);
  for (const value of ink) {
    const bucket = Math.min(255, Math.max(0, Math.round(value)));
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  return histogram;
}

/**
 * Otsu's method over an ink map: the split with the most between-class
 * variance. Returned as the FIRST inky level, so the caller's test is
 * `ink >= threshold` rather than a strictly-greater-than that would count the
 * top of the paper's own distribution as a pen stroke.
 */
export function otsuThreshold(ink: Float32Array): number {
  const histogram = histogramOf(ink);
  let weighted = 0;
  for (let level = 0; level < 256; level += 1) weighted += level * (histogram[level] ?? 0);

  let belowWeight = 0;
  let belowSum = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level += 1) {
    belowWeight += histogram[level] ?? 0;
    const aboveWeight = ink.length - belowWeight;
    belowSum += level * (histogram[level] ?? 0);
    if (belowWeight === 0 || aboveWeight === 0) continue;
    const belowMean = belowSum / belowWeight;
    const aboveMean = (weighted - belowSum) / aboveWeight;
    const between = belowWeight * aboveWeight * Math.pow(belowMean - aboveMean, 2);
    if (between > bestVariance) {
      bestVariance = between;
      best = level;
    }
  }
  return best + 1;
}

/** The attorney's slider, applied to Otsu's estimate. 50 leaves it alone. */
export function thresholdFor(base: number, sensitivity: number): number {
  const scale = 1.5 - Math.min(100, Math.max(0, sensitivity)) / 100;
  return Math.max(MIN_INK, base * scale);
}

/** True when the image already carries an alpha channel worth keeping. */
export function hasTransparency({ data }: Pixels): boolean {
  for (let offset = 3; offset < data.length; offset += 4) {
    if ((data[offset] ?? 255) < 255) return true;
  }
  return false;
}

/**
 * Whether the cleanup should start switched on. A phone photo or a scan always
 * needs it; a PNG that already carries transparency has been cleaned up once
 * already, and running it again would only eat at the strokes.
 */
export function cleanByDefault(mimeType: string, pixels: Pixels): boolean {
  return !(mimeType.toLowerCase().includes('png') && hasTransparency(pixels));
}

function inkAlpha(ink: number, threshold: number): number {
  return Math.min(255, Math.round((ink / (threshold * FULL_INK_FACTOR)) * 255));
}

/** Ink kept with its own colour; everything else becomes transparent. */
function paint(source: Pixels, keep: Uint8Array, ink: Float32Array, threshold: number): Pixels {
  const data = new Uint8ClampedArray(source.data.length);
  for (let index = 0; index < keep.length; index += 1) {
    if (keep[index] !== 1) continue;
    const offset = index * 4;
    data[offset] = source.data[offset] ?? 0;
    data[offset + 1] = source.data[offset + 1] ?? 0;
    data[offset + 2] = source.data[offset + 2] ?? 0;
    data[offset + 3] = inkAlpha(ink[index] ?? 0, threshold);
  }
  return { data, width: source.width, height: source.height };
}

/** The whole pipeline: a photographed signature in, pen strokes on nothing out. */
export function cleanSignature(source: Pixels, sensitivity = DEFAULT_SENSITIVITY): Pixels {
  const { width, height } = source;
  const gray = toGrayscale(source);
  const ink = inkMap(gray, localMean(gray, width, height, backgroundRadius(width, height)));
  const threshold = thresholdFor(otsuThreshold(ink), sensitivity);

  const marked = new Uint8Array(width * height);
  for (let index = 0; index < marked.length; index += 1) {
    marked[index] = (ink[index] ?? 0) >= threshold ? 1 : 0;
  }
  const kept = dropSpecks(marked, width, height, minSpeckArea(width, height));
  return paint(source, kept, ink, threshold);
}

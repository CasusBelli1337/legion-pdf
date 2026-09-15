/**
 * One exported page as pixels.
 *
 * The export lane hands the same shape to three different writers (PNG, JPEG,
 * TIFF), so the colour treatment is decided ONCE and every writer reads the
 * result the same way. Keeping the bilevel case in the same union as the
 * byte-per-sample cases is deliberate: a 1-bit page is the format litigation
 * productions actually ask for, and hiding it behind an 8-bit buffer would
 * mean encoding it wrong at the last moment.
 */

export type ImageKind = 'rgb' | 'gray' | 'bilevel';

export interface PageImage {
  kind: ImageKind;
  widthPx: number;
  heightPx: number;
  /**
   * Row-major samples, no padding between rows except what a bilevel row needs.
   *   rgb     — 3 bytes per pixel
   *   gray    — 1 byte per pixel, 0 = black
   *   bilevel — ceil(widthPx / 8) bytes per row, MSB first, a SET bit = black ink
   */
  samples: Uint8Array;
}

/** Samples in one row of this image, including a bilevel row's tail padding. */
export function bytesPerRow(image: Pick<PageImage, 'kind' | 'widthPx'>): number {
  if (image.kind === 'rgb') return image.widthPx * 3;
  if (image.kind === 'gray') return image.widthPx;
  return Math.ceil(image.widthPx / 8);
}

/** Samples per pixel as the TIFF tags count them. */
export function samplesPerPixel(kind: ImageKind): number {
  return kind === 'rgb' ? 3 : 1;
}

/** Bits per sample as the TIFF tags count them. */
export function bitsPerSample(kind: ImageKind): number {
  return kind === 'bilevel' ? 1 : 8;
}

/**
 * The "fast and empty" guard for images: a page whose buffer is the wrong size
 * is a page some earlier step silently truncated. Nothing encodes it.
 */
export function assertImage(image: PageImage, label: string): void {
  if (image.widthPx <= 0 || image.heightPx <= 0) {
    throw new RangeError(`${label} reports no area (${image.widthPx}x${image.heightPx}).`);
  }
  const expected = bytesPerRow(image) * image.heightPx;
  if (image.samples.length !== expected) {
    throw new RangeError(
      `${label} carries ${image.samples.length} bytes where ${expected} were expected ` +
        `for a ${image.widthPx}x${image.heightPx} ${image.kind} image.`
    );
  }
}

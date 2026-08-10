/**
 * Pure geometry helpers for rasterization. Kept free of pdfjs and canvas so
 * they are unit-testable in plain Node — the canvas path itself is verified in
 * the Windows live-QA pass.
 */

/** PDF user space is 72 units per inch, so scale is simply dpi/72. */
export function dpiToScale(dpi: number): number {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new RangeError(`Invalid DPI ${dpi}: rasterization needs a positive, finite DPI.`);
  }
  return dpi / 72;
}

/**
 * Validate a 1-based page against the real document length BEFORE slicing.
 * A collapsed window must fail loudly, never produce an empty raster.
 */
export function assertRasterPage(page: number, pageCount: number): void {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new RangeError(
      `Cannot rasterize page ${page}: this document has pages 1 through ${pageCount}.`
    );
  }
}

/** Canvas pixel dimensions for a viewport, rounded up so nothing is clipped. */
export function canvasSizeFor(
  viewportWidth: number,
  viewportHeight: number
): {
  widthPx: number;
  heightPx: number;
} {
  const widthPx = Math.max(1, Math.ceil(viewportWidth));
  const heightPx = Math.max(1, Math.ceil(viewportHeight));
  return { widthPx, heightPx };
}

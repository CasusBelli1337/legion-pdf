/**
 * Shapes and errors internal to the redaction engine.
 *
 * Everything that crosses the IPC boundary lives in @shared/types; these are the
 * intermediate forms the burn pipeline passes between its own stages, plus the
 * error classes that make a half-done redaction impossible to mistake for a
 * finished one.
 */

/** A rectangle in raster pixels, TOP-LEFT origin — the thing painted black. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An opaque 8-bit RGB raster, rows top to bottom, three bytes per pixel. */
export interface RgbImage {
  widthPx: number;
  heightPx: number;
  /** widthPx * heightPx * 3 bytes. */
  rgb: Uint8Array;
}

/** One page's raster, exactly as the renderer's `raster:response` delivers it. */
export interface PageRaster {
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
}

/** A page whose raster has already had its marks painted out. */
export interface BurnedPage {
  /** 1-based page number in the source document. */
  page: number;
  /** PNG bytes with the marked regions already opaque black. */
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
  /** How many pixels the burn actually blacked out — zero is a bug, not a result. */
  paintedPixels: number;
}

/** Thrown when apply is called with nothing marked. Never a silent no-op. */
export class NoRedactionMarksError extends Error {
  readonly code = 'NO_REDACTION_MARKS';
  constructor() {
    super('Nothing is marked for redaction yet — draw a box or search for a term first.');
    this.name = 'NoRedactionMarksError';
  }
}

/** Thrown when a mark cannot be mapped onto real pixels of the page it names. */
export class RedactionGeometryError extends Error {
  readonly code = 'REDACTION_GEOMETRY';
  constructor(message: string) {
    super(message);
    this.name = 'RedactionGeometryError';
  }
}

/** Thrown when a raster is not a PNG this engine can take apart pixel by pixel. */
export class UnsupportedRedactionRasterError extends Error {
  readonly code = 'UNSUPPORTED_REDACTION_RASTER';
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedRedactionRasterError';
  }
}

/**
 * Thrown when the verification pass finds a marked string still readable in the
 * output. The bytes are abandoned: nothing that fails verification is ever
 * adopted, saved, or shown to the user as a result.
 */
export class RedactionNotVerifiedError extends Error {
  readonly code = 'REDACTION_NOT_VERIFIED';
  constructor(readonly survivingStrings: readonly string[]) {
    super(
      `The redaction was NOT applied: ${survivingStrings.length} marked ` +
        `${survivingStrings.length === 1 ? 'item is' : 'items are'} still readable in the ` +
        'rebuilt document. The original document was not changed.'
    );
    this.name = 'RedactionNotVerifiedError';
  }
}

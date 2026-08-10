/**
 * The OCR lane's own vocabulary. Everything here is pure data — the hOCR
 * parser produces it, the text-layer writer consumes it, and the main-process
 * worker pool moves it between them. Node-safe: no Electron, no DOM.
 */

/**
 * A word box in RASTER PIXELS with a TOP-LEFT origin — the hOCR convention,
 * deliberately not PDF user space. `core/ocr/geometry` is the only place the
 * two coordinate systems meet.
 */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One word exactly as Tesseract reported it. */
export interface OcrWord {
  text: string;
  box: PixelBox;
  /** Tesseract's `x_wconf`, 0–100. */
  confidence: number;
}

/** One `ocr_page` element of an hOCR document. */
export interface HocrPage {
  /** Raster dimensions Tesseract saw, from the page bbox. */
  widthPx: number;
  heightPx: number;
  words: OcrWord[];
}

/** One recognized page, ready for the text-layer writer. */
export interface OcrPageWords {
  /** 1-based page number in the source document. */
  page: number;
  widthPx: number;
  heightPx: number;
  words: OcrWord[];
  /**
   * True only when the raster was PROVEN blank. Zero words with `blank: false`
   * is a failed page, and the writer refuses it — silent empty output is the
   * failure mode this codebase treats as the #1 enemy.
   */
  blank: boolean;
}

/** Thrown when Tesseract's hOCR cannot be trusted. Never swallowed. */
export class HocrParseError extends Error {
  readonly code = 'HOCR_PARSE';
  constructor(message: string) {
    super(message);
    this.name = 'HocrParseError';
  }
}

/** Thrown when a requested page produced no text and was not a blank raster. */
export class EmptyOcrPageError extends Error {
  readonly code = 'OCR_PAGE_EMPTY';
  constructor(readonly page: number) {
    super(
      `Page ${page} produced no recognized text and its image is not blank — ` +
        'refusing to report a successful run.'
    );
    this.name = 'EmptyOcrPageError';
  }
}

/** Thrown when a raster is in a PNG flavour the blank check cannot read. */
export class UnsupportedRasterError extends Error {
  readonly code = 'UNSUPPORTED_RASTER';
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedRasterError';
  }
}

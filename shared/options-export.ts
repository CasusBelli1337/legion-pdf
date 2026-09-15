/**
 * Option and detail shapes for exporting a PDF INTO another format — page
 * images and plain text (the export lane) and Word (the Word lane). Types
 * only, re-exported type-only from @shared/types. The list of formats the
 * picker shows is a value and lives in ./export-formats.ts.
 */

import type { PageRangeSpec } from './types';

export type ExportFormat = 'png' | 'jpeg' | 'tiff' | 'txt' | 'docx';

/** Colour treatment for the raster formats. */
export type ExportColorMode = 'color' | 'grayscale' | 'bw';

export interface ExportOptions {
  format: ExportFormat;
  /**
   * Where the output goes: a FOLDER for the per-page formats (one PNG or JPEG
   * per page) and a FILE path for the single-file ones (multi-page TIFF, TXT,
   * DOCX). `EXPORT_FORMATS[].output` says which a format wants.
   */
  outputPath: string;
  /** "1-5, 8"; omit for every page. Validated against the real page count. */
  pages?: PageRangeSpec;
  /** Raster formats only. */
  dpi?: number;
  /** Raster formats only; defaults to 'color'. */
  color?: ExportColorMode;
  /** JPEG only, 1–100. */
  quality?: number;
  /**
   * Word only. A page with no text layer is a scan: its text is recognised
   * first, and this says what becomes of the picture. Defaults to 'omit'.
   */
  scanPictures?: ScanPictureMode;
}

/**
 * What becomes of a scanned page's picture in the Word file once its text has
 * been recognised: left out, added after the last page as an appendix, or laid
 * behind the recognised text the way a searchable PDF keeps its scan.
 */
export type ScanPictureMode = 'omit' | 'appendix' | 'behind';

/**
 * What the Word export is about to do, stated BEFORE the button is pressed:
 * which pages are scans that will be recognised first, which are pleading
 * paper whose line numbers will be rebuilt — and the sentences the panel shows.
 */
export interface ExportPlan {
  format: ExportFormat;
  /** Pages the export will cover. */
  pageCount: number;
  /** 1-based pages with no text layer, whose text will be recognised first. */
  scannedPages: number[];
  /** 1-based pages detected as pleading paper (a numbered column). */
  pleadingPages: number[];
  /** Plain English for the panel, one line each. Empty when nothing special will happen. */
  lines: string[];
}

/** What a Word export kept and what it had to leave out, in plain English. */
export interface ExportReceipt {
  kept: string[];
  dropped: string[];
}

export interface ExportResult {
  format: ExportFormat;
  /** Every file written, absolute paths, in page order. Never empty. */
  files: string[];
  /** Pages the export covered — the caller checks it against the request. */
  pagesExported: number;
  /** Plain-English remarks the attorney should see, e.g. what could not be kept. */
  notes: string[];
  /** Word only: what was kept and what was left out. */
  receipt?: ExportReceipt;
}

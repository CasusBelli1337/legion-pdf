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
}

export interface ExportResult {
  format: ExportFormat;
  /** Every file written, absolute paths, in page order. Never empty. */
  files: string[];
  /** Pages the export covered — the caller checks it against the request. */
  pagesExported: number;
  /** Plain-English remarks the attorney should see, e.g. what could not be kept. */
  notes: string[];
}

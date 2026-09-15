/**
 * THE EXPORT SEAM. One format = one `Exporter` = one row in `EXPORTERS`.
 *
 * Config over code: adding a format means writing a function of this shape and
 * putting it in the table below — the IPC handler, the progress stream, the
 * count verification, and the panel's picker all keep working untouched.
 *
 * Everything an exporter can touch arrives in `ExporterContext`. Nothing in
 * here imports Electron, so the whole registry is exercised in Vitest with a
 * fake raster source and a fake filesystem.
 */

import type {
  ExportFormat,
  ExportOptions,
  ExportResult,
  LayoutRequest,
  LayoutResponse,
} from '@shared/types';
import { docxExporter } from './docx-exporter';
import { textExporter } from './text-exporter';
import { jpegExporter, pngExporter, tiffExporter } from './image-exporters';

/** One page's raster, exactly as the renderer's `raster:response` delivers it. */
export interface PageRaster {
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
}

/** A document opened once for reading, then asked page by page. */
export interface TextSource {
  pageText(page: number): Promise<string>;
  close(): Promise<void>;
}

/** One export, already validated: the pages exist and the format is known. */
export interface ExportJob {
  docId: string;
  bytes: Uint8Array;
  /** The document's own name, e.g. "Ashford Deposition.pdf" — output names start here. */
  fileName: string;
  options: ExportOptions;
  /** 1-based pages, sorted, checked against the real page count. Never empty. */
  pages: number[];
  /** Aborted by `export:cancel`. Every exporter checks it between pages. */
  signal: AbortSignal;
  /** Streams "Page 12 / 65" to the panel. Called once per page, before the work. */
  report(current: number, total: number, phase: string): void;
}

export interface ExporterContext {
  /** pdfjs lives in the renderer, so page images are asked for over IPC. */
  requestRaster(request: { docId: string; page: number; dpi: number }): Promise<PageRaster>;
  /** And page LAYOUTS — text runs, images, rules — the Word exporter's input. */
  requestLayout(request: Omit<LayoutRequest, 'requestId'>): Promise<LayoutResponse>;
  /** PNG → JPEG. Electron's nativeImage in production, a stub in tests. */
  toJpeg(png: Uint8Array, quality: number): Uint8Array;
  /** pdfjs again, this time main-side, for the plain-text export. */
  openText(bytes: Uint8Array): Promise<TextSource>;
  /** Atomic write. Refuses empty bytes; creates the folder if it is missing. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export type Exporter = (job: ExportJob, context: ExporterContext) => Promise<ExportResult>;

/**
 * A format that is declared but not built yet. Rejecting by channel-and-format
 * name is the same promise `electron/ipc/not-implemented.ts` makes: a half-wired
 * feature must never look like a working one.
 */
export const notYetExporter: Exporter = (job) =>
  Promise.reject(new Error(`NotImplemented: export ${job.options.format}`));

/** #seam:export-registry — every format this app can write, and who writes it. */
export const EXPORTERS: Record<ExportFormat, Exporter> = {
  png: pngExporter,
  jpeg: jpegExporter,
  tiff: tiffExporter,
  txt: textExporter,
  docx: docxExporter,
};

export function exporterFor(format: ExportFormat): Exporter {
  const exporter = EXPORTERS[format];
  if (exporter === undefined) throw new Error(`There is no exporter for "${format}".`);
  return exporter;
}

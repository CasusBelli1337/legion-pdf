/**
 * What every exporter is handed. One shape for images, text, and Word, so the
 * export lane's registry can call any of them the same way. The job carries
 * the document's bytes and the pages to cover; the context carries the two
 * renderer round-trips an exporter may need — rasters for image formats, page
 * layouts for Word.
 */

import type {
  ExportOptions,
  ExportResult,
  LayoutRequest,
  LayoutResponse,
  RasterRequest,
  RasterResponse,
} from '@shared/types';

export interface ExportJob {
  docId: string;
  bytes: Uint8Array;
  /** The document's file name, for naming what is written. */
  fileName: string;
  options: ExportOptions;
  /** 1-based pages to export, in order, already validated against the document. */
  pages: number[];
  signal: AbortSignal;
  /** Progress for the UI: "Page 12/65", with the phase in plain English. */
  report(current: number, total: number, phase: string): void;
}

export interface ExportContext {
  requestRaster(request: Omit<RasterRequest, 'requestId'>): Promise<RasterResponse>;
  requestLayout(request: Omit<LayoutRequest, 'requestId'>): Promise<LayoutResponse>;
}

export type Exporter = (job: ExportJob, context: ExportContext) => Promise<ExportResult>;

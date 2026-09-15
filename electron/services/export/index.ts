/**
 * LANE L's main-process surface. `electron/ipc/export.ts` imports from here and
 * nowhere else inside the folder, so the seam between the IPC layer and the
 * exporters stays one greppable list.
 */

export {
  ExportCancelledError,
  assertNotCancelled,
  cancelMessage,
  isExportCancelled,
} from './cancellation';
export { EXPORTERS, exporterFor, notYetExporter } from './exporter';
export type { Exporter, ExporterContext, ExportJob, PageRaster, TextSource } from './exporter';
export { ExportRunner, resolvePages } from './export-runner';
export type { ExportRunnerDeps } from './export-runner';
export { DEFAULT_DPI, DEFAULT_JPEG_QUALITY, exportDpi, exportQuality } from './image-exporters';
export { claimPageFiles, fileStem, pageFileName, padWidth } from './output-naming';
export { openPdfText } from './pdf-text';
export { joinPages, noTextMessage, pageBlock, pageSeparator } from './text-exporter';

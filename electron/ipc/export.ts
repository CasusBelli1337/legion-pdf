// #seam:ipc-contract
/**
 * LANE L (export) — the document as page images, a multi-page TIFF, plain text,
 * or a Word file.
 *
 * This file is deliberately thin. It supplies the things the exporters cannot
 * reach on their own — page rasters (the renderer owns the canvas), Electron's
 * JPEG encoder, pdfjs for text, local Tesseract, the document store, and the
 * disk — and hands everything else to `ExportRunner` and `exportPlan`, both of
 * which are unit-tested without Electron at all.
 */

import { cpus } from 'node:os';
import { existsSync } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { app, ipcMain, nativeImage } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  ExportFormat,
  ExportOptions,
  ExportPlan,
  ExportResult,
  OcrRunDetail,
  OpResult,
} from '@shared/types';
import { writeFileAtomic } from '../services/atomic-write';
import { chooseExportOutput } from '../services/native-dialogs';
import { ExportRunner, exportPlan, openPdfText, resolvePages } from '../services/export';
import type { ExporterContext, PageRaster } from '../services/export';
import { OcrService, resolveTesseract } from '../services/ocr';
import type { TesseractLocation } from '../services/ocr';
import type { IpcContext } from './context';

/** What the Word exporter recognizes a scanned page at. Same as the OCR panel. */
const SCAN_DPI = 300;
const SCAN_LANGUAGE = 'eng';

/** An empty raster is a page that was never drawn — never a page to write out. */
async function rasterThrough(
  context: IpcContext,
  request: { docId: string; page: number; dpi: number }
): Promise<PageRaster> {
  const response = await context.requestRaster(request);
  if (response.png === null || response.png.byteLength === 0) {
    throw new Error(`Page ${request.page} could not be turned into an image. Nothing was saved.`);
  }
  return { png: response.png, widthPx: response.widthPx, heightPx: response.heightPx };
}

function toJpeg(png: Uint8Array, quality: number): Uint8Array {
  const image = nativeImage.createFromBuffer(Buffer.from(png));
  if (image.isEmpty()) throw new Error('The page image could not be read back as a JPEG.');
  const jpeg = image.toJPEG(quality);
  if (jpeg.byteLength === 0) throw new Error('Saving the page as a JPEG produced no data.');
  return new Uint8Array(jpeg);
}

/** Same atomic write every save uses, plus the folder if it is not there yet. */
async function writeExportFile(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, bytes);
}

/** The bundled binary, resolved the same way `electron/ipc/ocr.ts` resolves it. */
function locateTesseract(): TesseractLocation {
  return resolveTesseract({
    platform: process.platform,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appRoot: app.getAppPath(),
    envPath: process.env.LIBRARIUS_TESSERACT_PATH,
    exists: existsSync,
  });
}

/**
 * One OCR service per export, so its progress goes to THAT export's readout
 * rather than the OCR panel's. The document's own bytes are never replaced:
 * the recognized copy is adopted by the exporter and dropped again.
 */
function recognizeText(
  context: IpcContext,
  docId: string,
  bytes: Uint8Array,
  pages: readonly number[],
  onProgress: (current: number, total: number) => void
): Promise<OpResult<OcrRunDetail>> {
  const service = new OcrService({
    requestRaster: (request) => context.requestRaster(request),
    locate: locateTesseract,
    cpuCount: () => cpus().length,
    tempRoot: app.getPath('temp'),
    emitProgress: (progress) => onProgress(progress.current, progress.total),
  });
  return service.run(docId, bytes, { pages: [...pages], language: SCAN_LANGUAGE, dpi: SCAN_DPI });
}

function exporterContext(context: IpcContext): ExporterContext {
  return {
    requestRaster: (request) => rasterThrough(context, request),
    requestLayout: (request) => context.requestLayout(request),
    recognizeText: (docId, bytes, pages, onProgress) =>
      recognizeText(context, docId, bytes, pages, onProgress),
    adopt: async (bytes, fileName) => (await context.store.adopt(bytes, fileName)).id,
    closeDoc: (docId) => context.store.close(docId),
    toJpeg,
    openText: openPdfText,
    writeFile: writeExportFile,
    exists: (path) =>
      access(path).then(
        () => true,
        () => false
      ),
  };
}

function planFor(context: IpcContext, docId: string, options: ExportOptions): Promise<ExportPlan> {
  return exportPlan({
    format: options.format,
    pages: resolvePages(options.pages, context.store.session(docId).pageCount),
    bytes: context.store.bytes(docId),
    requestLayout: async (page) => (await context.requestLayout({ docId, page })).layout,
  });
}

export function registerExportHandlers(context: IpcContext): void {
  const runner = new ExportRunner({
    context: exporterContext(context),
    bytesOf: (docId) => context.store.bytes(docId),
    fileNameOf: (docId) => context.store.session(docId).fileName,
    pageCountOf: (docId) => context.store.session(docId).pageCount,
    emitProgress: (event) => context.emitProgress(IPC.export.progress, event),
    sizeOf: async (path) => (await stat(path)).size,
  });

  ipcMain.handle(
    IPC.export.chooseOutput,
    (_event, format: ExportFormat, suggestedName: string): Promise<string | null> =>
      chooseExportOutput(context.getWindow(), format, suggestedName)
  );

  ipcMain.handle(
    IPC.export.plan,
    (_event, docId: string, options: ExportOptions): Promise<ExportPlan> =>
      planFor(context, docId, options)
  );

  ipcMain.handle(
    IPC.export.run,
    (_event, docId: string, options: ExportOptions): Promise<ExportResult> =>
      runner.run(docId, options)
  );

  ipcMain.handle(IPC.export.cancel, (_event, docId: string): void => {
    runner.cancel(docId);
  });
}

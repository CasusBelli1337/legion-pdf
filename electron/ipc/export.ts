// #seam:ipc-contract
/**
 * LANE L (export) — the document as page images, a multi-page TIFF, or plain
 * text. Word (.docx) is declared here too and served by the Word lane's
 * exporter; until that lands it rejects by name rather than looking wired.
 *
 * This file is deliberately thin. It supplies the four things the exporters
 * cannot reach on their own — page rasters (the renderer owns the canvas),
 * Electron's JPEG encoder, pdfjs for text, and the disk — and hands everything
 * else to `ExportRunner`, which is unit-tested without Electron at all.
 */

import { access, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ipcMain, nativeImage } from 'electron';
import { IPC } from '@shared/ipc';
import { registerNotImplemented } from './not-implemented';
import type { ExportFormat, ExportOptions, ExportResult } from '@shared/types';
import { writeFileAtomic } from '../services/atomic-write';
import { chooseExportOutput } from '../services/native-dialogs';
import { ExportRunner, openPdfText } from '../services/export';
import type { ExporterContext, PageRaster } from '../services/export';
import type { IpcContext } from './context';

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

function exporterContext(context: IpcContext): ExporterContext {
  return {
    requestRaster: (request) => rasterThrough(context, request),
    requestLayout: (request) => context.requestLayout(request),
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
    IPC.export.run,
    (_event, docId: string, options: ExportOptions): Promise<ExportResult> =>
      runner.run(docId, options)
  );

  ipcMain.handle(IPC.export.cancel, (_event, docId: string): void => {
    runner.cancel(docId);
  });

  // The scan lane answers this; until it lands it must fail by name, never look wired.
  registerNotImplemented([IPC.export.plan]);
}

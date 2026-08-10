// #seam:ipc-contract
/**
 * LANE D (OCR) — detect text-layer gaps, run the bundled Tesseract worker pool,
 * cancel a run. Page rasters come from the renderer through
 * `context.requestRaster` (pdfjs owns the only canvas); page-level progress
 * streams on `ocr:progress` so the UI can show "Page 37 of 214".
 *
 * Detection runs HERE rather than in the renderer: `ocr:detect` carries only a
 * docId, and reading the content streams needs no canvas and no round-trip.
 */

import { cpus } from 'node:os';
import { existsSync } from 'node:fs';
import { app, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { OcrDetectResult, OcrOptions, OcrRunDetail, OpResult } from '@shared/types';
import { OcrService, resolveTesseract } from '../services/ocr';
import type { TesseractLocation } from '../services/ocr';
import type { IpcContext } from './context';

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

function createService(context: IpcContext): OcrService {
  return new OcrService({
    requestRaster: (request) => context.requestRaster(request),
    emitProgress: (progress) => context.emitProgress(IPC.ocr.progress, progress),
    locate: locateTesseract,
    cpuCount: () => cpus().length,
    tempRoot: app.getPath('temp'),
  });
}

export function registerOcrHandlers(context: IpcContext): void {
  const service = createService(context);

  ipcMain.handle(IPC.ocr.detect, (_event, docId: string): Promise<OcrDetectResult> => {
    return service.detect(context.store.bytes(docId));
  });

  ipcMain.handle(
    IPC.ocr.run,
    async (_event, docId: string, options: OcrOptions): Promise<OpResult<OcrRunDetail>> => {
      const result = await service.run(docId, context.store.bytes(docId), options);
      await context.store.setBytes(docId, result.bytes);
      return result;
    }
  );

  ipcMain.handle(IPC.ocr.cancel, (_event, docId: string): void => {
    service.cancel(docId);
  });
}

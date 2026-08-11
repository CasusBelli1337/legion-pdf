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
import { access, readFile } from 'node:fs/promises';
import { app, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  BulkOcrOptions,
  BulkOcrResult,
  OcrDetectResult,
  OcrOptions,
  OcrRunDetail,
  OpResult,
} from '@shared/types';
import { BulkOcrRunner, OcrService, resolveTesseract } from '../services/ocr';
import type { OcrProgress, OcrServiceDeps, TesseractLocation } from '../services/ocr';
import { writeFileAtomic } from '../services/atomic-write';
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

/** Everything but the progress sink, which differs for a tab and for a bulk run. */
function serviceDeps(context: IpcContext): Omit<OcrServiceDeps, 'emitProgress'> {
  return {
    requestRaster: (request) => context.requestRaster(request),
    locate: locateTesseract,
    cpuCount: () => cpus().length,
    tempRoot: app.getPath('temp'),
  };
}

function createService(context: IpcContext): OcrService {
  return new OcrService({
    ...serviceDeps(context),
    emitProgress: (progress) => context.emitProgress(IPC.ocr.progress, progress),
  });
}

async function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  );
}

/**
 * The bulk lane, wired to the same store, pool, and binary as a tab run — with
 * two deliberate differences: documents are ADOPTED rather than opened (a bulk
 * file is not a "recent file", and the attorney's recent list stays theirs), and
 * output is written straight to disk rather than through the store, for the same
 * reason. Page progress is re-labelled by the runner as "<file> — page N of M".
 */
function createBulkRunner(context: IpcContext, service: OcrService): BulkOcrRunner {
  return new BulkOcrRunner({
    readFile: async (path) => new Uint8Array(await readFile(path)),
    adopt: async (bytes, fileName) => (await context.store.adopt(bytes, fileName)).id,
    closeDoc: (docId) => context.store.close(docId),
    detect: (bytes) => service.detect(bytes),
    // One service per file: its progress sink is that file's progress sink.
    runOcr: (docId, bytes, options, onProgress) => {
      const perFile = new OcrService({
        ...serviceDeps(context),
        emitProgress: (progress: OcrProgress) => onProgress(progress),
      });
      return perFile.run(docId, bytes, options);
    },
    writeOutput: async (path, bytes) => {
      await writeFileAtomic(path, bytes);
    },
    exists: fileExists,
    emitProgress: (event) => context.emitProgress(IPC.ocr.progress, event),
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

  const bulk = createBulkRunner(context, service);

  ipcMain.handle(
    IPC.ocr.bulk,
    (_event, paths: string[], options: BulkOcrOptions): Promise<BulkOcrResult> => {
      return bulk.run(paths, options);
    }
  );

  ipcMain.handle(IPC.ocr.bulkCancel, (): void => {
    bulk.cancel();
  });
}

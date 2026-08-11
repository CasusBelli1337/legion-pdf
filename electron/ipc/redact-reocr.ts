/**
 * LANE E — keeping a redacted document searchable, without ever un-redacting it.
 *
 * The text layer is written from the BURNED rasters that were just embedded,
 * never from a fresh render of the original page. That is the whole guarantee:
 * Tesseract is shown the same black rectangles the reader will see, so the words
 * it reports cannot include the ones that were destroyed. No raster round-trip
 * to the renderer happens here either — the pixels are already in hand.
 */

import { cpus } from 'node:os';
import { existsSync } from 'node:fs';
import { app } from 'electron';
import { IPC } from '@shared/ipc';
import type { OpResult, OcrRunDetail } from '@shared/types';
import type { BurnedPage } from '@core/redact';
import { OcrService, resolveTesseract } from '../services/ocr';
import type { TesseractLocation } from '../services/ocr';
import type { IpcContext } from './context';

const LANGUAGE = 'eng';

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

/** Serves the burned rasters in place of the renderer's canvas. */
function burnedRasterPort(burned: readonly BurnedPage[]) {
  const byPage = new Map(burned.map((page) => [page.page, page]));
  return (request: { page: number }) => {
    const raster = byPage.get(request.page);
    if (raster === undefined) {
      return Promise.reject(
        new Error(`Page ${request.page} has no burned raster to read text from.`)
      );
    }
    return Promise.resolve({
      requestId: `redact-${request.page}`,
      png: raster.png,
      widthPx: raster.widthPx,
      heightPx: raster.heightPx,
    });
  };
}

/**
 * Write a text layer over the rebuilt pages. Any failure takes the whole
 * redaction down rather than handing back a half-finished document — the
 * message names the way out, because blacking out an entire page legitimately
 * leaves Tesseract nothing to read.
 */
export async function reOcrBurnedPages(
  context: IpcContext,
  docId: string,
  bytes: Uint8Array,
  burned: readonly BurnedPage[],
  dpi: number
): Promise<Uint8Array> {
  const service = new OcrService({
    requestRaster: burnedRasterPort(burned),
    emitProgress: (progress) => context.emitProgress(IPC.redact.progress, progress),
    locate: locateTesseract,
    cpuCount: () => cpus().length,
    tempRoot: app.getPath('temp'),
  });
  const pages = burned.map((page) => page.page);
  try {
    const result: OpResult<OcrRunDetail> = await service.run(docId, bytes, {
      pages,
      language: LANGUAGE,
      dpi,
    });
    return result.bytes;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      'The pages were redacted, but making them searchable again failed, so nothing was ' +
        'saved. Try again with "Keep the redacted pages searchable" turned off — a page ' +
        `that is blacked out end to end has no text left to read. (${reason})`,
      { cause: error }
    );
  }
}

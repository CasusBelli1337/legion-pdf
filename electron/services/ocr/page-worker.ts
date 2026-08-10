/**
 * One page's journey: ask the renderer for a 300 DPI raster (pdfjs owns the
 * only canvas), drop it in the run's temp directory, hand it to Tesseract, and
 * turn the hOCR into word boxes. The temp PNG is deleted whether the page
 * succeeded or blew up.
 */

import { join } from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import type { RasterResponse } from '@shared/types';
import { EmptyOcrPageError, isBlankRaster, parseHocr } from '@core/ocr';
import type { OcrPageWords } from '@core/ocr';
import type { TesseractLocation } from './tesseract-binary';
import type { TesseractRunRequest } from './tesseract-cli';
import { TesseractFailedError } from './tesseract-cli';
import { throwIfCancelled } from './pool';

export interface PageJobContext {
  docId: string;
  dpi: number;
  language: string;
  /** Per-run temp directory; the caller creates and removes it. */
  workspace: string;
  location: TesseractLocation;
  signal: AbortSignal;
  requestRaster(request: { docId: string; page: number; dpi: number }): Promise<RasterResponse>;
  runHocr(request: TesseractRunRequest): Promise<string>;
}

function assertRaster(raster: RasterResponse, page: number): Uint8Array {
  if (raster.png === null || raster.png.byteLength === 0) {
    throw new TesseractFailedError(`Page ${page} rasterized to no image data.`);
  }
  return raster.png;
}

function assertSameSize(
  raster: RasterResponse,
  widthPx: number,
  heightPx: number,
  page: number
): void {
  if (raster.widthPx !== widthPx || raster.heightPx !== heightPx) {
    throw new TesseractFailedError(
      `Page ${page}: Tesseract read a ${widthPx}x${heightPx} image but the renderer ` +
        `produced ${raster.widthPx}x${raster.heightPx} — refusing to place words from it.`
    );
  }
}

async function hocrForImage(context: PageJobContext, imagePath: string): Promise<string> {
  try {
    return await context.runHocr({
      command: context.location.command,
      imagePath,
      language: context.language,
      dpi: context.dpi,
      tessdataPrefix: context.location.tessdataPrefix,
      signal: context.signal,
    });
  } finally {
    await unlink(imagePath).catch(() => undefined);
  }
}

/**
 * Recognize one 1-based page. A page with no words is only allowed through
 * when its raster is provably blank paper; anything else throws and takes the
 * whole run down with it.
 */
export async function recognizePage(page: number, context: PageJobContext): Promise<OcrPageWords> {
  throwIfCancelled(context.signal);
  const raster = await context.requestRaster({
    docId: context.docId,
    page,
    dpi: context.dpi,
  });
  const png = assertRaster(raster, page);
  throwIfCancelled(context.signal);

  const imagePath = join(context.workspace, `page-${page}.png`);
  await writeFile(imagePath, png);
  const parsed = parseHocr(await hocrForImage(context, imagePath));
  assertSameSize(raster, parsed.widthPx, parsed.heightPx, page);

  const blank = parsed.words.length === 0 && isBlankRaster(png);
  if (parsed.words.length === 0 && !blank) throw new EmptyOcrPageError(page);
  return {
    page,
    widthPx: parsed.widthPx,
    heightPx: parsed.heightPx,
    words: parsed.words,
    blank,
  };
}

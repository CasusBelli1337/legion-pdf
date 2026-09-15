/**
 * Pictures into a PDF. Always available — no installed program is involved.
 *
 * Three routes, picked by what the format is rather than by what is installed:
 *
 *  - PNG and JPEG are embedded straight into the page by pdf-lib. No re-encode,
 *    so a 40 MB scan stays exactly the picture the attorney was given.
 *  - TIFF is decoded page by page (they are routinely multi-page) and re-encoded
 *    as PNG, carrying the original's DPI across.
 *  - BMP, GIF and WebP are laid out and printed by Chromium, the browser engine
 *    already in the box. Electron's own `nativeImage` was measured first and
 *    decodes NONE of the three (it returns an empty image for each; PNG and
 *    JPEG are the only formats it reads), so there is nothing to try before
 *    Chromium — see docs/references/convert-to-pdf.md for the measurement.
 *
 * Multi-image support is built in (one page per picture) so a folder of scans
 * can become one PDF without this file changing.
 */

import { readFile } from 'node:fs/promises';
import { IMAGE_EXTENSIONS } from '@shared/convert-inputs';
import { imagesToPdf, type PdfImageSource } from '@core/ops';
import { reportConvertProgress } from './progress';
import { decodeTiffPages } from './tiff-decode';
import { ConvertFailedError, type ConvertEngine, type ConvertJob } from './types';

const DIRECT_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const TIFF_EXTENSIONS = ['.tif', '.tiff'];

/** What Chromium is told the bytes are when it does the decoding. */
const BROWSER_MEDIA_TYPES: Record<string, string> = {
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Null means "pdf-lib cannot carry this": Chromium has to lay it out instead. */
function sourcesFor(job: ConvertJob, bytes: Uint8Array): PdfImageSource[] | null {
  if (DIRECT_EXTENSIONS.includes(job.extension)) return [{ name: job.fileName, bytes }];
  if (TIFF_EXTENSIONS.includes(job.extension)) return decodeTiffPages(bytes, job.fileName);
  return null;
}

async function run(job: ConvertJob): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(job.filePath));
  if (bytes.byteLength === 0) {
    throw new ConvertFailedError(`${job.fileName} is empty (0 bytes) — there is no picture in it.`);
  }
  const sources = sourcesFor(job, bytes);
  if (sources === null) {
    const mediaType = BROWSER_MEDIA_TYPES[job.extension];
    if (mediaType === undefined) {
      throw new ConvertFailedError(
        `${job.fileName} is a picture format this computer cannot read.`
      );
    }
    const { printImage } = await import('./chromium-print');
    return printImage(bytes, mediaType, job.fileName);
  }
  const phase = `Converting ${job.fileName}`;
  const result = await imagesToPdf(sources, (current, total) =>
    reportConvertProgress(phase, current, total)
  );
  return result.bytes;
}

export const IMAGE_ENGINE: ConvertEngine = {
  id: 'image',
  label: 'Built-in picture converter',
  extensions: IMAGE_EXTENSIONS,
  note: () =>
    'Pictures become PDF pages at their own size when the file records its resolution, and are ' +
    'fitted to a Letter page when it does not. Multi-page TIFFs keep every page.',
  available: () => Promise.resolve(true),
  run,
};

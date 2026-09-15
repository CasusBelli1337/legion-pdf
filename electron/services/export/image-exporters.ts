/**
 * The three picture formats: one PNG or JPEG per page into a folder, or one
 * multi-page TIFF.
 *
 * Every page arrives as a PNG from the renderer (pdfjs owns the only canvas),
 * so a colour PNG export writes those bytes STRAIGHT THROUGH — re-encoding a
 * lossless image to get the same pixels back would only cost time and risk.
 * Anything else — grayscale, black-and-white, JPEG, TIFF — decodes that PNG
 * with the app's own decoder, converts once, and re-encodes.
 */

import { exportFormatInfo } from '@shared/export-formats';
import type { ExportColorMode, ExportOptions } from '@shared/types';
import { convertColor, countTiffPages, encodeTiffPages, prepareTiffPage, toRgb } from '@core/image';
import type { PageImage, PreparedTiffPage } from '@core/image';
import { decodePng, encodeRgbPng, toOpaqueRgb } from '@core/redact';
import { assertNotCancelled } from './cancellation';
import type { Exporter, ExporterContext, ExportJob, PageRaster } from './exporter';
import { claimPageFiles, fileStem } from './output-naming';

/** Readable on screen, sane on disk — and what the panel starts on. */
export const DEFAULT_DPI = 200;
export const DEFAULT_JPEG_QUALITY = 85;
const MIN_DPI = 36;
const MAX_DPI = 1200;
/** The phase label the panel shows beside "Page 12 / 65". */
const PHASE = 'Exporting';

export function exportDpi(options: ExportOptions): number {
  const dpi = Math.round(options.dpi ?? DEFAULT_DPI);
  if (!Number.isFinite(dpi) || dpi < MIN_DPI || dpi > MAX_DPI) {
    throw new RangeError(
      `${options.dpi} dots per inch is outside the ${MIN_DPI}-${MAX_DPI} range this app exports at.`
    );
  }
  return dpi;
}

export function exportQuality(options: ExportOptions): number {
  const quality = Math.round(options.quality ?? DEFAULT_JPEG_QUALITY);
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new RangeError(`JPEG quality has to be between 1 and 100, not ${options.quality}.`);
  }
  return quality;
}

function colorOf(options: ExportOptions): ExportColorMode {
  return options.color ?? 'color';
}

/** The renderer's PNG, flattened onto opaque white — never a see-through page. */
function pageOf(raster: PageRaster): PageImage {
  const rgb = toOpaqueRgb(decodePng(raster.png));
  return { kind: 'rgb', widthPx: rgb.widthPx, heightPx: rgb.heightPx, samples: rgb.rgb };
}

function rasterOf(job: ExportJob, context: ExporterContext, page: number): Promise<PageRaster> {
  return context.requestRaster({ docId: job.docId, page, dpi: exportDpi(job.options) });
}

/** One page as PNG bytes, colour-treated. Untouched when nothing has to change. */
async function pngFor(job: ExportJob, context: ExporterContext, page: number): Promise<Uint8Array> {
  const raster = await rasterOf(job, context, page);
  const mode = colorOf(job.options);
  if (mode === 'color') return raster.png;
  const wide = toRgb(convertColor(pageOf(raster), mode));
  return encodeRgbPng({ widthPx: wide.widthPx, heightPx: wide.heightPx, rgb: wide.samples });
}

async function jpegFor(
  job: ExportJob,
  context: ExporterContext,
  page: number
): Promise<Uint8Array> {
  return context.toJpeg(await pngFor(job, context, page), exportQuality(job.options));
}

type PageBytes = (job: ExportJob, context: ExporterContext, page: number) => Promise<Uint8Array>;

/**
 * The shape both per-page formats share: reserve every file name up front (so a
 * collision is caught before a single byte is written), then one page, one file,
 * one progress tick — and a cancel check before each.
 */
function perPageExporter(format: 'png' | 'jpeg', render: PageBytes): Exporter {
  const { extension } = exportFormatInfo(format);
  return async (job, context) => {
    const { files, note } = await claimPageFiles(
      {
        folder: job.options.outputPath,
        stem: fileStem(job.fileName),
        pages: job.pages,
        extension,
        pageCount: Math.max(...job.pages),
      },
      context.exists
    );
    for (const [index, page] of job.pages.entries()) {
      assertNotCancelled(job.signal, index, index);
      job.report(index + 1, job.pages.length, PHASE);
      const target = files[index];
      if (target === undefined) throw new Error(`No output name was reserved for page ${page}.`);
      await context.writeFile(target, await render(job, context, page));
    }
    return {
      format,
      files,
      pagesExported: job.pages.length,
      notes: note === null ? [] : [note],
    };
  };
}

export const pngExporter: Exporter = perPageExporter('png', pngFor);
export const jpegExporter: Exporter = perPageExporter('jpeg', jpegFor);

/**
 * One file, every page. Pages are compressed as they arrive and the raw raster
 * is dropped, so peak memory is the compressed document plus one page — not the
 * whole production at 11 MB a page.
 */
export const tiffExporter: Exporter = async (job, context) => {
  const mode = colorOf(job.options);
  const prepared: PreparedTiffPage[] = [];
  for (const [index, page] of job.pages.entries()) {
    assertNotCancelled(job.signal, index, 0);
    job.report(index + 1, job.pages.length, PHASE);
    prepared.push(prepareTiffPage(convertColor(pageOf(await rasterOf(job, context, page)), mode)));
  }
  assertNotCancelled(job.signal, job.pages.length, 0);
  job.report(job.pages.length, job.pages.length, 'Writing the TIFF file');

  const tiff = encodeTiffPages(prepared, exportDpi(job.options));
  const inFile = countTiffPages(tiff);
  if (inFile !== job.pages.length) {
    throw new Error(
      `The TIFF came out holding ${inFile} pages where ${job.pages.length} were asked for. ` +
        'Nothing was saved.'
    );
  }
  await context.writeFile(job.options.outputPath, tiff);
  return {
    format: 'tiff',
    files: [job.options.outputPath],
    pagesExported: job.pages.length,
    notes: [],
  };
};

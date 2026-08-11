/**
 * Rebuilding the document with the burned pages in place of the originals.
 *
 * This is the lesson core/ops/rebuild.ts already paid for, applied to the one
 * feature where getting it wrong is unforgivable: pdf-lib's writer serializes
 * every object still in the context, so replacing a page's CONTENT leaves the
 * old content stream sitting in the saved file, fully readable. The only way a
 * page's text is really gone is if the page never enters the output document at
 * all. So the surviving pages are COPIED into a fresh document — pdf-lib's
 * copier follows only what those pages reference — and each redacted page is
 * built new from nothing but its burned raster.
 *
 * The new page keeps the original media box, crop box, and /Rotate, so nothing
 * that measures the document notices the swap. Its annotations, links, and
 * fonts do not come across: they belonged to the page that was destroyed.
 */

import { degrees } from 'pdf-lib';
import type { PDFDocument } from 'pdf-lib';
import { createPdf, loadPdf, readOutline, savePdf, toZeroBased, writeOutline } from '@core/ops';
import type { ProgressReporter } from '@core/ops';
import { assertRasterMatchesPage, imagePlacement } from './geometry';
import { carryMetadata, redactTitles } from './carry-over';

export interface BurnedRaster {
  /** 1-based page in the SOURCE document this raster replaces. */
  page: number;
  /** PNG bytes, marks already blacked out. */
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
}

export interface RebuildResult {
  bytes: Uint8Array;
  pagesIn: number;
  pagesOut: number;
  /** Info fields that were dropped because they quoted destroyed text. */
  droppedMetadata: string[];
}

async function addImagePage(
  rebuilt: PDFDocument,
  source: PDFDocument,
  raster: BurnedRaster
): Promise<void> {
  const sourcePage = source.getPage(raster.page - 1);
  const media = sourcePage.getMediaBox();
  const crop = sourcePage.getCropBox();
  const rotation = sourcePage.getRotation().angle;
  assertRasterMatchesPage(raster.page, rotation, crop, raster.widthPx, raster.heightPx);

  const page = rebuilt.addPage([media.width, media.height]);
  page.setMediaBox(media.x, media.y, media.width, media.height);
  page.setCropBox(crop.x, crop.y, crop.width, crop.height);
  page.setRotation(degrees(rotation));

  const image = await rebuilt.embedPng(raster.png);
  const placement = imagePlacement(rotation, crop);
  page.drawImage(image, {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    rotate: degrees(placement.rotate),
  });
}

function assertRastersMatchPages(
  rasters: readonly BurnedRaster[],
  pageCount: number
): Map<number, BurnedRaster> {
  if (rasters.length === 0) {
    throw new Error('The rebuild was handed no burned pages — nothing would be destroyed.');
  }
  const byPage = new Map<number, BurnedRaster>();
  for (const raster of rasters) {
    if (raster.page < 1 || raster.page > pageCount) {
      throw new RangeError(`Page ${raster.page} is outside this ${pageCount}-page document.`);
    }
    if (byPage.has(raster.page)) throw new Error(`Page ${raster.page} was burned twice.`);
    if (raster.png.byteLength === 0) throw new Error(`Page ${raster.page} burned to no image.`);
    byPage.set(raster.page, raster);
  }
  return byPage;
}

async function assemble(
  rebuilt: PDFDocument,
  source: PDFDocument,
  byPage: Map<number, BurnedRaster>,
  onProgress?: ProgressReporter
): Promise<void> {
  const pageCount = source.getPageCount();
  const survivors = Array.from({ length: pageCount }, (_unused, index) => index + 1).filter(
    (page) => !byPage.has(page)
  );
  const copied =
    survivors.length === 0 ? [] : await rebuilt.copyPages(source, toZeroBased(survivors));
  let nextSurvivor = 0;
  for (let page = 1; page <= pageCount; page += 1) {
    const raster = byPage.get(page);
    if (raster === undefined) {
      const carried = copied[nextSurvivor];
      nextSurvivor += 1;
      if (carried === undefined) throw new Error(`Page ${page} was lost while rebuilding.`);
      rebuilt.addPage(carried);
    } else {
      await addImagePage(rebuilt, source, raster);
    }
    onProgress?.(page, pageCount);
  }
}

/**
 * A new document in which every burned page is an image-only page and every
 * other page is carried over untouched. The page count is asserted against the
 * source before the bytes are handed back.
 */
export async function rebuildWithImagePages(
  bytes: Uint8Array,
  rasters: readonly BurnedRaster[],
  needles: readonly string[],
  onProgress?: ProgressReporter
): Promise<RebuildResult> {
  const source = await loadPdf(bytes, 'document being redacted');
  const pagesIn = source.getPageCount();
  const byPage = assertRastersMatchPages(rasters, pagesIn);

  const rebuilt = await createPdf();
  await assemble(rebuilt, source, byPage, onProgress);
  const droppedMetadata = carryMetadata(source, rebuilt, needles).dropped;
  writeOutline(rebuilt, redactTitles(readOutline(source), needles));

  const pagesOut = rebuilt.getPageCount();
  if (pagesOut !== pagesIn) {
    throw new Error(
      `The rebuilt document has ${pagesOut} pages where the original had ${pagesIn} — ` +
        'the redaction was abandoned rather than saved.'
    );
  }
  return { bytes: await savePdf(rebuilt, 'redacted document'), pagesIn, pagesOut, droppedMetadata };
}

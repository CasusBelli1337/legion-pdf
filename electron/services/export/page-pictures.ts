/**
 * Exhibit pages as pictures, for the Word exporter.
 *
 * core/export decides WHICH pages are picture pages (a scan or drawing behind
 * typed pages — `picturePagesOf`); this draws each of them whole through the
 * renderer and hands core the picture. JPEG at 150 dpi: a hundred pages of
 * exhibits stay near 20 MB where PNGs would run past 100.
 *
 * A page that cannot be drawn stops the export — the alternative is a sheet
 * that silently lost its exhibit.
 */

import type { PagePicture } from '@core/export';
import type { ExportContext, ExportJob } from './export-job';

export const PHASE_PICTURES = 'Keeping exhibit pages as pictures';
/** Same as DPI in qa/word-export/page-pictures.ts. */
export const PICTURE_DPI = 150;
const JPEG_QUALITY = 82;

/** True when this context can draw pages at all (tests of other paths leave it out). */
export function canDrawPages(context: ExportContext): boolean {
  return context.requestRaster !== undefined;
}

export async function pagePicturesOf(
  job: ExportJob,
  context: ExportContext,
  pages: readonly number[]
): Promise<Map<number, PagePicture>> {
  const pictures = new Map<number, PagePicture>();
  const { requestRaster, toJpeg } = context;
  if (requestRaster === undefined) return pictures;
  for (const [index, page] of pages.entries()) {
    if (job.signal.aborted) throw new Error('The export was stopped.');
    job.report(index + 1, pages.length, PHASE_PICTURES);
    const raster = await requestRaster({ docId: job.docId, page, dpi: PICTURE_DPI });
    if (raster.png.byteLength === 0) {
      throw new Error(`Page ${page} could not be turned into a picture. Nothing was saved.`);
    }
    pictures.set(
      page,
      toJpeg === undefined
        ? { data: raster.png, type: 'png' }
        : { data: toJpeg(raster.png, JPEG_QUALITY), type: 'jpg' }
    );
  }
  if (pictures.size !== pages.length) {
    throw new Error(`Only ${pictures.size} of ${pages.length} exhibit pages could be drawn.`);
  }
  return pictures;
}

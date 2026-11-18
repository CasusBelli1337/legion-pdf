/**
 * Handwriting on a typed page. A note-taking app (Nebo, GoodNotes, an iPad's
 * markup) signs a declaration in vector ink and lays an INVISIBLE reading of
 * that ink over it — "dalwhrl" across the signature, "13" on the date's
 * blank. To the export that reading looked like an OCR layer: the guess was
 * typed into the Word file beside the name, and the ink itself, being neither
 * text nor a picture, was gone.
 *
 * Invisible text on a page that is otherwise typed, with no picture under it,
 * is such a reading. Its words are dropped and the patch of page it covers is
 * drawn as a picture (core/export pins a picture over text to its spot), so
 * the signature is in the Word file where it was signed.
 */

import type { LayoutImage, LayoutRule, LayoutTextRun, PdfRect } from '@shared/types';
import type { RasterizedImage } from './extract-page-layout';
import type { PageMarks } from './page-origin';

/** Draws a patch of the page (PDF user space) as a picture; null when it cannot. */
export type RegionDrawer = (rect: PdfRect) => Promise<RasterizedImage | null>;

/** A page is typed when its visible letters outnumber its invisible ones this many times. */
const TYPED_RATIO = 5;
/** Room kept around the reading's box (× its size, and at least MIN_PAD points): ink overshoots its reading. */
const PAD = 0.3;
const MIN_PAD = 4;

function lettersOf(runs: readonly LayoutTextRun[]): number {
  return runs.reduce((sum, run) => sum + run.text.trim().length, 0);
}

function contains(rect: PdfRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function overPicture(run: LayoutTextRun, images: readonly LayoutImage[]): boolean {
  return images.some((image) => contains(image.rect, run.x + run.width / 2, run.y));
}

/** The invisible runs that read handwriting: indexes into `runs`, empty on a scan or an untouched page. */
export function inkReadings(
  runs: readonly LayoutTextRun[],
  images: readonly LayoutImage[]
): number[] {
  const hidden = runs.filter((run) => run.hidden === true && run.text.trim().length > 0);
  if (hidden.length === 0) return [];
  const visible = runs.filter((run) => run.hidden !== true);
  if (lettersOf(visible) < TYPED_RATIO * lettersOf(hidden)) return [];
  return runs.flatMap((run, index) =>
    run.hidden === true && !overPicture(run, images) ? [index] : []
  );
}

/** The patch of page a reading covers, with room for the strokes that overshoot it. */
export function inkRegion(run: LayoutTextRun): PdfRect {
  const pad = Math.max(MIN_PAD, PAD * run.sizePt);
  return {
    x: run.x - pad,
    y: run.y - pad,
    width: run.width + 2 * pad,
    height: run.sizePt + 2 * pad,
  };
}

/** A stroke the rule reader took for a rule (the upright of a handwritten "1") is ink, not a rule. */
export function outsideInk(rule: LayoutRule, regions: readonly PdfRect[]): boolean {
  const { x, y, width, height } = rule.rect;
  return !regions.some(
    (region) =>
      x >= region.x &&
      y >= region.y &&
      x + width <= region.x + region.width &&
      y + height <= region.y + region.height
  );
}

/**
 * Handwriting's invisible reading comes out of the runs; the patch it covered
 * goes in as a picture. Answers how many patches could not be drawn. A turned
 * page's patch would need turning too: its reading is left as it was.
 */
export async function pictureInk(
  raw: PageMarks,
  drawRegion: RegionDrawer | undefined,
  rotation: number
): Promise<number> {
  const readings = new Set(rotation === 0 ? inkReadings(raw.runs, raw.images) : []);
  if (readings.size === 0) return 0;
  const regions = raw.runs.filter((_, index) => readings.has(index)).map(inkRegion);
  raw.runs = raw.runs.filter((_, index) => !readings.has(index));
  raw.rules = raw.rules.filter((rule) => outsideInk(rule, regions));
  let leftOut = 0;
  for (const rect of regions) {
    const picture = (await drawRegion?.(rect)) ?? null;
    if (picture === null) leftOut += 1;
    else raw.images.push({ rect, ...picture });
  }
  return leftOut;
}

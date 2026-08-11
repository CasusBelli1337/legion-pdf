/**
 * Finding the run of text a drawn box is asking about. Pure: pdfjs hands over
 * text items, this decides which one the attorney meant.
 *
 * "Nearest" is measured box to box, not centre to centre, so a box drawn
 * directly over a line wins outright and a box drawn just beneath one still
 * picks that line rather than a heading half a page away.
 */

import type { PdfRect } from '@shared/types';

/** The slice of a pdfjs TextItem this needs. Same shape as the search lane's. */
export interface PageTextItem {
  str: string;
  /** PDF-space text matrix [a, b, c, d, e, f]; (e, f) is the baseline origin. */
  transform: readonly number[];
  /** Advance width of the whole run, in PDF points. */
  width: number;
  /** Run height, in PDF points — the size the run is set in. */
  height: number;
  /** pdfjs' key for the face, which also keys `TextContent.styles`. */
  fontName: string;
}

export interface PageTextRun {
  fontKey: string;
  sizePt: number;
  /** The run's box in PDF user space. */
  box: PdfRect;
}

/** One run's box, following the run's own direction so rotated text still fits. */
function boxOf(item: PageTextItem): PdfRect {
  const [a = 0, b = 0, , , e = 0, f = 0] = item.transform;
  const length = Math.hypot(a, b);
  const unitX = length === 0 ? 1 : a / length;
  const unitY = length === 0 ? 0 : b / length;
  const spanX = unitX * item.width;
  const spanY = unitY * item.width;
  return {
    x: Math.min(e, e + spanX),
    y: Math.min(f, f + spanY),
    width: Math.max(Math.abs(spanX), 1),
    height: Math.max(Math.abs(spanY), item.height, 1),
  };
}

export function runsFromItems(items: readonly PageTextItem[]): PageTextRun[] {
  return items
    .filter((item) => item.str.trim().length > 0 && item.fontName !== '')
    .map((item) => ({ fontKey: item.fontName, sizePt: item.height, box: boxOf(item) }));
}

/** Gap between two boxes on one axis; zero when they overlap. */
function gap(low: number, high: number, otherLow: number, otherHigh: number): number {
  return Math.max(0, otherLow - high, low - otherHigh);
}

/** Distance from a box to a rectangle, zero when they touch or overlap. */
export function boxDistance(box: PdfRect, rect: PdfRect): number {
  const dx = gap(box.x, box.x + box.width, rect.x, rect.x + rect.width);
  const dy = gap(box.y, box.y + box.height, rect.y, rect.y + rect.height);
  return Math.hypot(dx, dy);
}

/** The run a box drawn at `rect` is closest to, or null on a page with no text. */
export function nearestRun(runs: readonly PageTextRun[], rect: PdfRect): PageTextRun | null {
  let best: PageTextRun | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const run of runs) {
    const distance = boxDistance(run.box, rect);
    if (distance < bestDistance) {
      best = run;
      bestDistance = distance;
    }
  }
  return best;
}

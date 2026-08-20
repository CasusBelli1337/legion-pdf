/**
 * Finding the line numbers down the margin — "all the numbers on the left",
 * which is the first thing an attorney does NOT want in a copied quote.
 *
 * A line-number column is a vertical stack of items that are nothing but a
 * small integer, sharing a left edge, counting UP as the page goes down. That
 * last part is what separates one column from four: a condensed transcript puts
 * FOUR mini-pages on a sheet, and the stack in the left margin of the bottom
 * mini-page restarts at 1 directly under the stack of the top one. A restart
 * ends a column and begins the next.
 *
 * Quadrants are numbered in READING order for a 2x2 condensed sheet — down the
 * left column of mini-pages first, then down the right: 0 = top-left,
 * 1 = bottom-left, 2 = top-right, 3 = bottom-right.
 */

import type { PageSize, PdfRect } from '@shared/types';
import { centerX, centerY, clusterValues, median, rightOf } from './item-geometry';
import type { PositionedItem } from './item-geometry';

/** Pleading paper is 28 lines; deposition pages run 25. Above this it is not a line. */
export const MAX_LINE_NUMBER = 28;

/** Fewer numbers than this in a stack is a coincidence, not a margin. */
const MIN_STACK = 5;

/** Left edges within this many points are the same column. */
const X_TOLERANCE_PT = 6;

/** The mini-page of a condensed sheet, in reading order. Null = ordinary page. */
export type Quadrant = 0 | 1 | 2 | 3 | null;

export interface LineNumberEntry {
  itemIndex: number;
  value: number;
  box: PdfRect;
}

export interface LineNumberColumn {
  xMin: number;
  xMax: number;
  /** The numbered mini-page this column belongs to; null on an ordinary page. */
  quadrant: Quadrant;
  entries: LineNumberEntry[];
}

/** Which mini-page of a condensed sheet a point falls in. */
export function quadrantForPoint(x: number, y: number, size: PageSize, multiUp: boolean): Quadrant {
  if (!multiUp) return null;
  const isRight = x > size.width / 2;
  const isTop = y > size.height / 2;
  if (isRight) return isTop ? 2 : 3;
  return isTop ? 0 : 1;
}

/** An item that is a bare integer in line-number range, and nothing else. */
function asLineCandidate(item: PositionedItem): LineNumberEntry | null {
  const text = item.item.str.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number.parseInt(text, 10);
  if (value < 1 || value > MAX_LINE_NUMBER) return null;
  return { itemIndex: item.itemIndex, value, box: item.box };
}

/**
 * One x-band split into stacks. Numbers must climb as the page descends; the
 * moment a value repeats or drops, a new mini-page has started.
 */
function stacksInBand(band: readonly LineNumberEntry[]): LineNumberEntry[][] {
  const stacks: LineNumberEntry[][] = [];
  let current: LineNumberEntry[] = [];
  let previous = Number.POSITIVE_INFINITY;
  for (const entry of [...band].sort((a, b) => centerY(b.box) - centerY(a.box))) {
    if (current.length > 0 && entry.value <= previous) {
      stacks.push(current);
      current = [];
    }
    current.push(entry);
    previous = entry.value;
  }
  if (current.length > 0) stacks.push(current);
  return stacks.filter((stack) => stack.length >= MIN_STACK);
}

function quadrantOf(stack: readonly LineNumberEntry[], size: PageSize): Quadrant {
  return quadrantForPoint(
    median(stack.map((entry) => centerX(entry.box))),
    median(stack.map((entry) => centerY(entry.box))),
    size,
    true
  );
}

function columnOf(stack: readonly LineNumberEntry[], quadrant: Quadrant): LineNumberColumn {
  return {
    xMin: Math.min(...stack.map((entry) => entry.box.x)),
    xMax: Math.max(...stack.map((entry) => rightOf(entry.box))),
    quadrant,
    entries: [...stack].sort((a, b) => a.value - b.value),
  };
}

/**
 * Every line-number column on the page.
 *
 * Quadrants are only assigned once there are at least three stacks: two stacks
 * are as likely to be one column that a stray integer split as they are to be
 * a 2-up sheet, and mislabelling an ordinary pleading page as multi-up would
 * scramble its reading order.
 */
export function findLineNumberColumns(
  items: readonly PositionedItem[],
  size: PageSize
): LineNumberColumn[] {
  const candidates = items
    .map(asLineCandidate)
    .filter((entry): entry is LineNumberEntry => entry !== null);

  const stacks = clusterValues(candidates, (entry) => entry.box.x, X_TOLERANCE_PT).flatMap(
    stacksInBand
  );
  const multiUp = stacks.length >= 3;

  return stacks
    .map((stack) => columnOf(stack, multiUp ? quadrantOf(stack, size) : null))
    .sort((a, b) => (a.quadrant ?? 0) - (b.quadrant ?? 0) || a.xMin - b.xMin);
}

/** Every item index claimed by a line-number column. */
export function lineNumberIndices(columns: readonly LineNumberColumn[]): Set<number> {
  return new Set(columns.flatMap((column) => column.entries.map((entry) => entry.itemIndex)));
}

/** True when a box sits inside (or a whisker outside) some column's x-band. */
export function inColumnBand(box: PdfRect, columns: readonly LineNumberColumn[]): boolean {
  const slack = 4;
  return columns.some(
    (column) => box.x >= column.xMin - slack && rightOf(box) <= column.xMax + slack
  );
}

/**
 * The line number vertically nearest a box, within the column that governs it.
 * Null when no column governs the box, or when the nearest number is further
 * away than a line of text — a caption that floats above line 1 gets no cite
 * line rather than a wrong one.
 */
export function lineNumberFor(
  box: PdfRect,
  columns: readonly LineNumberColumn[],
  quadrant: Quadrant
): number | null {
  const column = columns
    .filter(
      (candidate) =>
        (candidate.quadrant === quadrant || candidate.quadrant === null) && candidate.xMax <= box.x
    )
    .sort((a, b) => a.xMax - b.xMax)
    .at(-1);
  if (column === undefined || column.entries.length === 0) return null;

  const spacing = lineSpacingOf(column);
  const target = centerY(box);
  let best: LineNumberEntry | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of column.entries) {
    const distance = Math.abs(centerY(entry.box) - target);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  if (best === undefined || bestDistance > spacing) return null;
  return best.value;
}

/** Typical vertical distance between consecutive numbers in a column. */
export function lineSpacingOf(column: LineNumberColumn): number {
  const centers = column.entries.map((entry) => centerY(entry.box)).sort((a, b) => b - a);
  const gaps = centers.slice(1).map((value, index) => (centers[index] ?? value) - value);
  const spacing = median(gaps);
  return spacing > 0 ? spacing : 12;
}

/**
 * The geometry every other file in this lane stands on: a pdfjs text item's
 * box in PDF user space, and the two groupings that make a page readable —
 * items that sit on the same LINE, and values that sit in the same vertical
 * BAND (an x-cluster, which is how a line-number column is found).
 *
 * Pure arithmetic, no DOM and no pdfjs import, so the whole classifier can be
 * unit tested against hand-built pages.
 */

import type { PdfRect } from '@shared/types';

/** The slice of a pdfjs `TextItem` selection intelligence needs. */
export interface TextItemLike {
  str: string;
  /** PDF-space text matrix [a, b, c, d, e, f]; (e, f) is the baseline origin. */
  transform: readonly number[];
  /** Advance width of the whole run, in PDF points. */
  width: number;
  /** Run height, in PDF points. */
  height: number;
}

/** One text item with its page-local ordinal and its box, computed once. */
export interface PositionedItem {
  /** pdfjs textContent item index within its page. */
  itemIndex: number;
  item: TextItemLike;
  box: PdfRect;
}

/**
 * The item's box, anchored at the baseline origin exactly the way the search
 * lane anchors its quads (`components/viewer/text-search.ts`) — the two must
 * agree, because a highlight drawn from a selection has to land where a
 * highlight drawn from a search hit lands.
 */
export function boxOfItem(item: TextItemLike): PdfRect {
  const [, , , , e = 0, f = 0] = item.transform;
  return {
    x: e,
    y: f,
    width: Math.max(item.width, 0.01),
    height: Math.max(item.height, 1),
  };
}

export function positionItems(items: readonly TextItemLike[]): PositionedItem[] {
  return items.map((item, itemIndex) => ({ itemIndex, item, box: boxOfItem(item) }));
}

export function centerY(box: PdfRect): number {
  return box.y + box.height / 2;
}

export function centerX(box: PdfRect): number {
  return box.x + box.width / 2;
}

export function rightOf(box: PdfRect): number {
  return box.x + box.width;
}

/** Two boxes share a line when their vertical extents mostly overlap. */
export function onSameLine(left: PdfRect, right: PdfRect): boolean {
  const overlap =
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return overlap >= Math.min(left.height, right.height) / 2;
}

/**
 * Items grouped into visual lines, lines top-to-bottom and each line
 * left-to-right — reading order for one column of text.
 */
export function groupIntoLines(items: readonly PositionedItem[]): PositionedItem[][] {
  const lines: PositionedItem[][] = [];
  const byY = [...items].sort((a, b) => centerY(b.box) - centerY(a.box));
  for (const item of byY) {
    const line = lines.find((group) => group.some((member) => onSameLine(member.box, item.box)));
    if (line === undefined) lines.push([item]);
    else line.push(item);
  }
  return lines.map((line) => [...line].sort((a, b) => a.box.x - b.box.x));
}

/** The median of a list. Zero for an empty list, so callers never divide by NaN. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1] ?? 0;
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

/**
 * Values grouped into bands no wider than `tolerance` between neighbours.
 * Used on left edges: a line-number column is a band, body text is a band.
 */
export function clusterValues<T>(
  entries: readonly T[],
  valueOf: (entry: T) => number,
  tolerance: number
): T[][] {
  const sorted = [...entries].sort((a, b) => valueOf(a) - valueOf(b));
  const clusters: T[][] = [];
  let current: T[] = [];
  let previous = Number.NEGATIVE_INFINITY;
  for (const entry of sorted) {
    const value = valueOf(entry);
    if (current.length > 0 && value - previous > tolerance) {
      clusters.push(current);
      current = [];
    }
    current.push(entry);
    previous = value;
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/**
 * The box around characters [from, to) of one run.
 *
 * pdfjs gives an advance width for the whole run and nothing per glyph, so the
 * slice is proportional — an estimate, reliably a hair short, which is why the
 * redaction lane pads every quad it is handed.
 */
export function quadForSlice(item: TextItemLike, from: number, to: number): PdfRect {
  const length = item.str.length;
  const [a = 0, b = 0, , , e = 0, f = 0] = item.transform;
  const direction = Math.hypot(a, b);
  const unitX = direction === 0 ? 1 : a / direction;
  const unitY = direction === 0 ? 0 : b / direction;
  const perChar = length === 0 ? 0 : item.width / length;
  const offset = perChar * from;
  return {
    x: e + unitX * offset,
    y: f + unitY * offset,
    width: Math.max(perChar * (to - from), 0.01),
    height: Math.max(item.height, 1),
  };
}

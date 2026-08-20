/**
 * Turning a drag across the page into text an attorney can paste into a brief.
 *
 * The naive answer — everything the browser thinks is selected, in DOM order —
 * gives you the margin numbers, the running head, the Bates stamp, and a hard
 * line break after every eleven words. This produces the opposite: body runs
 * only, in reading order (down the left mini-page of a condensed sheet before
 * the right one), lines inside a paragraph joined with a space, paragraphs kept
 * apart, and words broken across a line put back together.
 */

import type { PdfRect } from '@shared/types';
import { centerY, groupIntoLines, median, quadForSlice, rightOf } from './item-geometry';
import type { PositionedItem } from './item-geometry';
import { regionOf } from './page-classifier';
import type { ClassifiedPage, Quadrant } from './page-classifier';

/** Characters [from, to) of one text item. */
export interface TextSlice {
  itemIndex: number;
  from: number;
  to: number;
}

export interface PageSelection {
  page: ClassifiedPage;
  slices: readonly TextSlice[];
}

/** One visual line of the selection, already in reading order. */
export interface SelectedLine {
  text: string;
  box: PdfRect;
  page: number;
  region: Quadrant;
}

/** A gap wider than this fraction of the type size is a word space. */
const SPACE_FRACTION = 0.2;

/** More than this much extra leading starts a new paragraph. */
const PARAGRAPH_GAP_RATIO = 1.6;

/** An indent this far past the column's usual left edge starts a paragraph. */
const INDENT_PT = 6;

/** A last line this far short of the right margin ended its paragraph. */
const SHORT_LINE_FRACTION = 0.25;

function sliceOf(item: PositionedItem, slice: TextSlice): { text: string; box: PdfRect } {
  const from = Math.max(0, Math.min(slice.from, item.item.str.length));
  const to = Math.max(from, Math.min(slice.to, item.item.str.length));
  return { text: item.item.str.slice(from, to), box: quadForSlice(item.item, from, to) };
}

/** Body-role slices only, positioned — the non-body roles never reach the clipboard. */
function bodyPieces(selection: PageSelection): PositionedItem[] {
  const pieces: PositionedItem[] = [];
  for (const slice of selection.slices) {
    const item = selection.page.positioned[slice.itemIndex];
    if (item === undefined) continue;
    if (selection.page.roles.get(slice.itemIndex) !== 'body') continue;
    const { text, box } = sliceOf(item, slice);
    if (text.trim().length === 0) continue;
    pieces.push({ itemIndex: item.itemIndex, item: { ...item.item, str: text }, box });
  }
  return pieces;
}

function joinAcross(pieces: readonly PositionedItem[]): string {
  let text = '';
  let previous: PositionedItem | undefined;
  for (const piece of pieces) {
    const gap = previous === undefined ? 0 : piece.box.x - rightOf(previous.box);
    const needsSpace =
      previous !== undefined &&
      !/\s$/.test(text) &&
      !/^\s/.test(piece.item.str) &&
      gap > Math.max(1, piece.box.height * SPACE_FRACTION);
    text += needsSpace ? ` ${piece.item.str}` : piece.item.str;
    previous = piece;
  }
  return text.trim();
}

function boundsOf(pieces: readonly PositionedItem[]): PdfRect {
  const left = Math.min(...pieces.map((piece) => piece.box.x));
  const bottom = Math.min(...pieces.map((piece) => piece.box.y));
  const right = Math.max(...pieces.map((piece) => rightOf(piece.box)));
  const top = Math.max(...pieces.map((piece) => piece.box.y + piece.box.height));
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

/** One page's selected body text as ordered lines, mini-page by mini-page. */
export function linesForPage(selection: PageSelection): SelectedLine[] {
  const pieces = bodyPieces(selection);
  const lines: SelectedLine[] = [];
  for (const region of selection.page.regions) {
    const inRegion = pieces.filter((piece) => regionOf(selection.page, piece) === region);
    for (const line of groupIntoLines(inRegion)) {
      const text = joinAcross(line);
      if (text.length > 0) {
        lines.push({ text, box: boundsOf(line), page: selection.page.classification.page, region });
      }
    }
  }
  return lines;
}

interface ColumnMetrics {
  left: number;
  right: number;
}

function metricsFor(lines: readonly SelectedLine[]): Map<string, ColumnMetrics> {
  const metrics = new Map<string, ColumnMetrics>();
  const keys = new Set(lines.map(columnKey));
  for (const key of keys) {
    const group = lines.filter((line) => columnKey(line) === key);
    metrics.set(key, {
      left: median(group.map((line) => line.box.x)),
      right: Math.max(...group.map((line) => rightOf(line.box))),
    });
  }
  return metrics;
}

function columnKey(line: SelectedLine): string {
  return `${line.page}:${line.region ?? 'x'}`;
}

function typicalGapOf(lines: readonly SelectedLine[]): number {
  const gaps: number[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const line = lines[index];
    if (previous === undefined || line === undefined) continue;
    if (columnKey(previous) !== columnKey(line)) continue;
    gaps.push(centerY(previous.box) - centerY(line.box));
  }
  const typical = median(gaps.filter((gap) => gap > 0));
  return typical > 0 ? typical : Number.POSITIVE_INFINITY;
}

type Seam = 'hyphen' | 'paragraph' | 'space';

/**
 * A line that stops well short of the column's right edge ended its paragraph —
 * measured against the column's WIDTH, never its absolute right coordinate,
 * which is a page-margin number and says nothing about how full the line is.
 */
function isShort(line: SelectedLine, column: ColumnMetrics | undefined): boolean {
  if (column === undefined) return false;
  const width = column.right - column.left;
  return width > 0 && rightOf(line.box) < column.right - width * SHORT_LINE_FRACTION;
}

function seamBetween(
  previous: SelectedLine,
  line: SelectedLine,
  metrics: Map<string, ColumnMetrics>,
  typicalGap: number
): Seam {
  if (/[A-Za-z]-$/.test(previous.text) && /^[a-z]/.test(line.text)) return 'hyphen';
  const column = metrics.get(columnKey(line));
  if (column !== undefined && line.box.x - column.left > INDENT_PT) return 'paragraph';

  const previousColumn = metrics.get(columnKey(previous));
  if (isShort(previous, previousColumn) && /[.?!]["')\]]?$/.test(previous.text)) {
    return 'paragraph';
  }

  if (columnKey(previous) !== columnKey(line)) return 'space';
  return centerY(previous.box) - centerY(line.box) > typicalGap * PARAGRAPH_GAP_RATIO
    ? 'paragraph'
    : 'space';
}

/** Ordered lines welded into flowing prose. */
export function joinLines(lines: readonly SelectedLine[]): string {
  const metrics = metricsFor(lines);
  const typicalGap = typicalGapOf(lines);
  let text = lines[0]?.text ?? '';
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const line = lines[index];
    if (previous === undefined || line === undefined) continue;
    const seam = seamBetween(previous, line, metrics, typicalGap);
    if (seam === 'hyphen') text = `${text.slice(0, -1)}${line.text}`;
    else text += seam === 'paragraph' ? `\n\n${line.text}` : ` ${line.text}`;
  }
  return text;
}

/** The whole selection as one flowing string, pages in order. */
export function smartTextFor(pages: readonly PageSelection[]): string {
  const ordered = [...pages].sort(
    (a, b) => a.page.classification.page - b.page.classification.page
  );
  return joinLines(ordered.flatMap(linesForPage));
}

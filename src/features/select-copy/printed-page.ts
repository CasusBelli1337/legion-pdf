/**
 * The number PRINTED at the bottom of the page — the only page number that
 * belongs in a cite. The PDF's own index is wrong by every cover sheet, proof
 * of service and exhibit tab in the file, so it is used here as EVIDENCE (the
 * printed number is usually near it) and never as the answer.
 *
 * Two traps this exists to avoid:
 *   1. The last line number. On pleading paper "28" sits in the bottom band,
 *      looks exactly like a page number, and is off by a mile on page 3.
 *   2. Everything else numeric down there — Bates numbers, dates, "Page 4 of
 *      37" where 37 is not the answer.
 *
 * Where the evidence runs out the answer degrades honestly: a value still comes
 * back, marked low confidence, and the menu says "check cite".
 */

import type { PageSize, PdfRect } from '@shared/types';
import { centerX, centerY, rightOf } from './item-geometry';
import type { PositionedItem } from './item-geometry';
import { MAX_LINE_NUMBER, inColumnBand } from './line-columns';
import type { LineNumberColumn } from './line-columns';

/** The footer band a printed page number is looked for in. */
const BOTTOM_BAND = 0.12;

/** Within this band the candidate is unmistakably footer furniture. */
const DEEP_BAND = 0.06;

/** Beyond this many pages of drift from the PDF index, stop believing it. */
const MAX_TRUSTED_OFFSET = 20;

/** The winner has to beat the runner-up by this much to be called high. */
const DECISIVE_MARGIN = 3;

export interface PrintedNumber {
  value: number | null;
  confidence: 'high' | 'low';
  /** The item carrying it, so the classifier can mark that item off. */
  itemIndex: number | null;
}

const NONE: PrintedNumber = { value: null, confidence: 'low', itemIndex: null };

/**
 * The page number inside a footer string: a bare number, "Page 4", "- 4 -",
 * "[4]", "4 of 37". Anything wordier is not a page number.
 */
export function parsePrintedNumber(text: string): number | null {
  const match = /^(?:page\s*)?[[(\-–—\s]*(\d{1,4})[\])\-–—\s]*(?:of\s*\d{1,4})?$/i.exec(
    text.trim()
  );
  const digits = match?.[1];
  if (digits === undefined) return null;
  const value = Number.parseInt(digits, 10);
  return value > 0 ? value : null;
}

interface Candidate {
  itemIndex: number;
  value: number;
  score: number;
}

/**
 * Lower is better: distance from the PDF index dominates, then centring, then
 * depth in the footer. A small number a long way from the index is the
 * signature of a stray line number and is pushed to the back.
 */
function scoreOf(value: number, box: PdfRect, size: PageSize, pdfIndex: number): number {
  const distance = Math.abs(value - pdfIndex);
  const offCentre = Math.abs(centerX(box) - size.width / 2) > size.width * 0.15 ? 4 : 0;
  const looksLikeLine = value <= MAX_LINE_NUMBER && distance > 10 ? 8 : 0;
  const shallow = box.y < size.height * DEEP_BAND ? 0 : 2;
  return distance + offCentre + looksLikeLine + shallow;
}

/**
 * A number that continues a line-number column — same x, and a value the
 * column already uses — is that column's last line, not the page number.
 */
function continuesAColumn(
  value: number,
  box: PdfRect,
  columns: readonly LineNumberColumn[]
): boolean {
  return columns.some(
    (column) =>
      Math.abs(centerX(box) - (column.xMin + column.xMax) / 2) < 20 &&
      column.entries.some((entry) => entry.value === value)
  );
}

function candidatesIn(
  items: readonly PositionedItem[],
  size: PageSize,
  pdfIndex: number,
  columns: readonly LineNumberColumn[]
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const item of items) {
    if (item.box.y > size.height * BOTTOM_BAND) continue;
    const value = parsePrintedNumber(item.item.str);
    if (value === null) continue;
    if (inColumnBand(item.box, columns) || continuesAColumn(value, item.box, columns)) continue;
    candidates.push({
      itemIndex: item.itemIndex,
      value,
      score: scoreOf(value, item.box, size, pdfIndex),
    });
  }
  return candidates.sort((a, b) => a.score - b.score);
}

/** The best printed page number on one page, judged on its own. */
export function findPrintedPageNumber(
  items: readonly PositionedItem[],
  size: PageSize,
  pdfIndex: number,
  columns: readonly LineNumberColumn[]
): PrintedNumber {
  const [best, runnerUp] = candidatesIn(items, size, pdfIndex, columns);
  if (best === undefined) return NONE;

  const near = Math.abs(best.value - pdfIndex) <= MAX_TRUSTED_OFFSET;
  const decisive = runnerUp === undefined || runnerUp.score - best.score >= DECISIVE_MARGIN;
  return {
    value: best.value,
    confidence: near && decisive ? 'high' : 'low',
    itemIndex: best.itemIndex,
  };
}

/**
 * A second opinion once neighbouring pages have been read. Running consecutive
 * numbers are stronger evidence than closeness to the PDF index — that is how
 * volume 3 of a transcript, printed 412 on PDF page 7, is believed — and a
 * number that fits neither neighbour is demoted no matter how plausible it
 * looked alone.
 */
export function reconcilePrintedNumbers(
  observed: ReadonlyMap<number, PrintedNumber>
): Map<number, PrintedNumber> {
  const reconciled = new Map<number, PrintedNumber>();
  for (const [page, printed] of observed) {
    reconciled.set(page, judgeAgainstNeighbours(page, printed, observed));
  }
  return reconciled;
}

function judgeAgainstNeighbours(
  page: number,
  printed: PrintedNumber,
  observed: ReadonlyMap<number, PrintedNumber>
): PrintedNumber {
  const before = observed.get(page - 1)?.value ?? null;
  const after = observed.get(page + 1)?.value ?? null;
  if (printed.value === null || (before === null && after === null)) return printed;
  const monotone = printed.value - 1 === before || printed.value + 1 === after;
  return { ...printed, confidence: monotone ? 'high' : 'low' };
}

/**
 * The mini-page number printed above one quadrant of a condensed sheet — the
 * number that belongs in the cite, since a condensed sheet has four of them and
 * the sheet itself has none. `items` must already be narrowed to the quadrant.
 */
export function findQuadrantNumber(
  items: readonly PositionedItem[],
  column: LineNumberColumn
): { value: number; itemIndex: number } | null {
  const top = Math.max(...column.entries.map((entry) => centerY(entry.box)));
  const band = column.entries[0]?.box.height ?? 10;
  const above = items.filter(
    (item) =>
      centerY(item.box) > top && centerY(item.box) < top + band * 4 && item.box.x >= column.xMin
  );
  for (const item of [...above].sort((a, b) => rightOf(b.box) - rightOf(a.box))) {
    const value = parsePrintedNumber(item.item.str);
    if (value !== null) return { value, itemIndex: item.itemIndex };
  }
  return null;
}

/**
 * Recognised lines that fit where the scan's lines fit. An OCR layer's size
 * is a box height, not a type size, and Word sets the words in its own Times:
 * a line a hair wider than the scan's wraps its last word onto a line of its
 * own, and three such words push a page of exact line boxes onto the next
 * sheet (a six-page scanned cross-complaint came out as nine). Each
 * recognised line is measured in Times and, when it would not fit the room
 * the page gives it, set a half point at a time smaller until it does.
 */

import type { BodyFrame, Cell, Line } from './model';

/** Times advance widths for U+0020–U+007E, thousandths of an em (the AFM figures Times New Roman shares). */
const TIMES_WIDTHS: readonly number[] = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611,
  556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722,
  722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500,
  278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541,
];
/** A character outside the table (an accent, a curly quote, a dash) is taken as this wide. */
const OTHER_WIDTH = 556;
/** Word's Times may run this much wider than the figures say (kerning off, a bold word). */
const SAFETY = 1.03;
/** Room kept clear before a tab stop or the margin, points. */
const CLEARANCE = 2;
/** run-scale.ts condenses a recognised cell at least this wide, points, and never below this share. */
const SCALED_FROM = 24;
const MIN_SCALE_SHARE = 0.6;
/** A width this far over its room, points, is the measurement's rounding. */
const ROUNDING = 0.5;
/** Never set a line smaller than this: below it the text is unreadable, and wrapping is the lesser harm. */
const MIN_SIZE_PT = 6;

/** The width of `text` set in Times at `sizePt`, points. */
export function timesWidth(text: string, sizePt: number): number {
  let thousandths = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    thousandths += TIMES_WIDTHS[code - 32] ?? OTHER_WIDTH;
  }
  return (thousandths * sizePt) / 1000;
}

function cellWidth(cell: Cell, sizePt: number): number {
  return cell.runs.reduce((sum, run) => sum + timesWidth(run.text, sizePt), 0);
}

/**
 * The share of its size a cell can keep in `room` points. A recognised cell
 * wide enough to measure is condensed to the width the scan gave it
 * (run-scale.ts): when that width fits, so does the cell, whatever Times would
 * have made of it. Otherwise the type itself must fit, taken a little wider
 * than the figures say and with room kept before the next stop.
 */
function cellShare(cell: Cell, sizePt: number, room: number): number {
  const times = cellWidth(cell, sizePt);
  if (times <= 0 || room <= CLEARANCE) return 1;
  const natural = cell.right - cell.x;
  const condensed = natural >= SCALED_FROM && natural <= room + ROUNDING;
  if (condensed) return Math.min(1, natural / (MIN_SCALE_SHARE * times));
  return Math.min(1, (room - CLEARANCE) / (times * SAFETY));
}

/** The largest share of its size the line can keep and still fit every cell's room. */
function fitShare(line: Line, frame: BodyFrame): number {
  let share = 1;
  line.cells.forEach((cell, index) => {
    const next = line.cells[index + 1];
    const room = (next === undefined ? frame.right : next.x) - cell.x;
    share = Math.min(share, cellShare(cell, line.sizePt, room));
  });
  return share;
}

function isRecognizedLine(line: Line): boolean {
  const runs = line.cells.flatMap((cell) => cell.runs);
  return runs.length > 0 && runs.every((run) => run.hidden);
}

/**
 * The lines, with every recognised line that Word's Times would set wider
 * than its room on the page set smaller, to the half point, until it fits.
 * Lines that fit, and lines of real text, come back untouched.
 */
export function fitRecognizedLines(lines: readonly Line[], frame: BodyFrame): Line[] {
  return lines.map((line) => {
    if (!isRecognizedLine(line)) return line;
    const share = fitShare(line, frame);
    if (share >= 1) return line;
    const sizePt = Math.max(MIN_SIZE_PT, Math.floor(line.sizePt * share * 2) / 2);
    return {
      ...line,
      sizePt,
      cells: line.cells.map((cell) => ({
        ...cell,
        runs: cell.runs.map((run) => ({ ...run, sizePt: Math.min(run.sizePt, sizePt) })),
      })),
    };
  });
}

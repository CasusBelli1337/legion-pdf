/**
 * A line's runs gathered into cells: runs a word space apart join one cell, a
 * gap of several ems, an upright rule, a dot leader or a checkbox starts the
 * next. Cells are what become tab stops and table cells.
 */

import { CHECKBOX_CHECKED, CHECKBOX_EMPTY } from '@shared/layout-model';
import type { LayoutRule, LayoutTextRun } from '@shared/types';
import type { Cell, StyledRun } from './model';

/**
 * A gap this wide (× size) reads as a space between words. Justified text and
 * some producers (Aspose, court e-filing systems) set spaces at barely an
 * eighth of an em; kerned fragments inside a word sit closer than that.
 */
const SPACE_GAP = 0.12;
/** A gap this wide (× size) reads as a column boundary, not a word space. */
const COLUMN_GAP = 2.2;
/** A run of dots (a table of contents' leader) between an entry and its page number. */
export const DOT_LEADER = /^[.\s·…]{5,}$/;
/** The same leader glued to the end of the entry's own run: "Judgment. ......". */
export const TRAILING_LEADER = /(\S)([.\s·…]*\.{5,}[.\s·…]*)$/;

/** Raised alike, condensed alike, and neither one a footnote's reference mark (a mark never merges). */
function sameSetting(a: StyledRun, b: StyledRun): boolean {
  return (
    (a.superscript ?? false) === (b.superscript ?? false) &&
    (a.scalePct ?? 100) === (b.scalePct ?? 100) &&
    a.footnote === undefined &&
    b.footnote === undefined
  );
}

/** Two runs that would look identical in Word — the ones that merge into one. */
export function sameStyle(a: StyledRun, b: StyledRun): boolean {
  return (
    a.fontKey === b.fontKey &&
    Math.abs(a.sizePt - b.sizePt) < 0.25 &&
    a.colorHex === b.colorHex &&
    a.underline === b.underline &&
    sameSetting(a, b)
  );
}

function appendRun(cell: Cell, run: StyledRun, spaced: boolean): void {
  const previous = cell.runs.at(-1);
  if (previous === undefined) {
    cell.runs.push(run);
    return;
  }
  const needsSpace = spaced && !previous.text.endsWith(' ') && !run.text.startsWith(' ');
  if (sameStyle(previous, run)) {
    previous.text += (needsSpace ? ' ' : '') + run.text;
    return;
  }
  // The space after a raised mark is set at the text's size, not the mark's:
  // carried on a footnote reference it came out a point narrower, and the
  // next line's first word climbed onto the room that left.
  if (needsSpace && previous.superscript === true && run.superscript !== true) {
    cell.runs.push({ ...run, text: ` ${run.text}` });
    return;
  }
  if (needsSpace) previous.text += ' ';
  cell.runs.push(run);
}

/**
 * A vertical rule drawn between two runs is a column boundary whatever the gap
 * measures: a caption box's upright rule is the filing SAYING where the column
 * ends, and some templates leave barely two ems either side of it.
 */
function ruledBetween(
  rules: readonly LayoutRule[],
  from: number,
  to: number,
  baseline: number
): boolean {
  return rules.some(
    ({ rect }) =>
      rect.width <= 3 &&
      rect.height > 3 &&
      rect.x > from &&
      rect.x + rect.width < to &&
      rect.y <= baseline &&
      rect.y + rect.height >= baseline
  );
}

/** "Judgment. ........" → "Judgment." plus the fact that a leader follows. */
export function withoutTrailingLeader(text: string): { text: string; leads: boolean } {
  const match = TRAILING_LEADER.exec(text);
  if (match === null) return { text, leads: false };
  return { text: text.slice(0, text.length - (match[2]?.length ?? 0)), leads: true };
}

/**
 * A run that is always a cell of its own. A drawn checkbox stands in the text
 * as a box character: the text after it began at a tab stop, not a space
 * away, and flowed from the box it would wrap its paragraph differently. A
 * caption's ")" stands in a column down the page (recognized-pages.ts): the
 * title beside it starts at its own stop, however near the parenthesis is.
 */
export function standsAlone(run: LayoutTextRun): boolean {
  return run.text === CHECKBOX_EMPTY || run.text === CHECKBOX_CHECKED || run.ownCell === true;
}

export interface Cursor {
  /** Right edge of everything placed so far. */
  right: number;
  /** A run that stands alone was just placed: the next run opens a cell. */
  box: boolean;
  /** A dot leader was just passed: the next run opens a right-tabbed cell. */
  leader: boolean;
}

/** Whether `run` opens a new cell: a wide gap, a rule between, or a leader just crossed. */
export function opensCell(
  run: LayoutTextRun,
  cursor: Cursor,
  rules: readonly LayoutRule[],
  baseline: number
): boolean {
  const gap = run.x - cursor.right;
  return (
    cursor.leader ||
    cursor.box ||
    standsAlone(run) ||
    gap > COLUMN_GAP * Math.max(run.sizePt, 1) ||
    ruledBetween(rules, cursor.right, run.x, baseline)
  );
}

/** Adds one run to the cells: opening a cell, or joining the last one with a space where the gap says so. */
export function placeRun(
  cells: Cell[],
  run: LayoutTextRun,
  styledRun: StyledRun,
  cursor: Cursor,
  opens: boolean
): void {
  const cell = cells.at(-1);
  if (cell === undefined || opens) {
    cells.push({
      x: run.x,
      right: run.x + run.width,
      runs: [styledRun],
      ...(cursor.leader ? { leader: 'dot' } : {}),
    });
    return;
  }
  const gap = run.x - cursor.right;
  // An OCR layer's runs are whole words by construction: any gap is a space.
  const spaced = gap > SPACE_GAP * Math.max(run.sizePt, 1) || (run.hidden === true && gap > 0.3);
  appendRun(cell, styledRun, spaced);
  cell.right = Math.max(cell.right, run.x + run.width);
}

/** The size most of the line's characters are set in. */
export function dominantSize(runs: readonly LayoutTextRun[]): number {
  const weight = new Map<number, number>();
  for (const run of runs) {
    const size = Math.round(run.sizePt * 2) / 2;
    weight.set(size, (weight.get(size) ?? 0) + run.text.length);
  }
  let best = runs[0]?.sizePt ?? 0;
  let bestWeight = -1;
  for (const [size, count] of weight) {
    if (count > bestWeight) {
      best = size;
      bestWeight = count;
    }
  }
  return best;
}

/** A recognised cell keeps the line's size unless its own differs by at least this, points. */
const OWN_SIZE_FROM = 1;

/**
 * A recognised line is one size in Word (an OCR layer's sizes are box heights)
 * — but its CELLS need not be: a foot sets a document number in six point and
 * the page number beside it in the body's ten. Each recognised cell whose own
 * words plainly agree on another size than the line's takes that size.
 */
export function withCellSizes(
  cells: readonly Cell[],
  runs: readonly LayoutTextRun[],
  lineSizePt: number
): Cell[] {
  if (cells.length < 2) return [...cells];
  return cells.map((cell) => {
    if (!cell.runs.every((run) => run.hidden && run.superscript !== true)) return cell;
    const own = runs.filter(
      (run) => run.x >= cell.x - 0.01 && run.x + run.width <= cell.right + 0.01
    );
    const sizePt = Math.round(dominantSize(own) * 2) / 2;
    if (own.length === 0 || Math.abs(sizePt - lineSizePt) < OWN_SIZE_FROM) return cell;
    return { ...cell, runs: cell.runs.map((run) => ({ ...run, sizePt })) };
  });
}

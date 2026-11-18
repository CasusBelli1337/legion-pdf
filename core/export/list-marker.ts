/**
 * The tab after a paragraph's number. "1." and its text are set a tab apart,
 * and some templates' tab is narrower than the gap that marks a column
 * (lines.ts' COLUMN_GAP): joined with a space, the first line came out two
 * ems short, the next line's first word fitted on the end of it, and Word
 * re-wrapped the paragraph a line short — every line below it a line high.
 */

import type { LayoutTextRun } from '@shared/types';
import type { Cell } from './model';

/**
 * "1.", "12)", "(a)", "iv." or a bullet, alone at the head of a line. Not
 * "IV." or "A.": those number headings, which are centred and keep their
 * space.
 */
const MARKER = /^(?:\(?(?:\d{1,3}|[a-z]|[ivxlcdm]{2,6})[.)]|[•·▪◦])$/;
/** A gap this wide (× size) after a marker is a tab: no word space is an em wide. */
const MARKER_TAB = 1;

/** Whether `run` starts a tab away from a list marker that is all the line holds so far. */
export function tabbedAfterMarker(
  cells: readonly Cell[],
  run: LayoutTextRun,
  right: number
): boolean {
  const [only, ...rest] = cells;
  if (only === undefined || rest.length > 0) return false;
  const text = only.runs
    .map((part) => part.text)
    .join('')
    .trim();
  return MARKER.test(text) && run.x - right > MARKER_TAB * Math.max(run.sizePt, 1);
}

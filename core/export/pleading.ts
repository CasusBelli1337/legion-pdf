/**
 * Pleading paper: the numbered column down the left margin that every
 * California filing carries. The numbers are not body text — copying them into
 * the Word file as words would put "1", "2", "3" in the attorney's paragraphs.
 * Word has native line numbering that restarts on every page, so the numbers
 * are dropped from the flow and Word is told to number the lines itself, on
 * the same pitch the PDF used. The flow keeps that pitch as exact line spacing
 * and expresses blank numbered lines as empty paragraphs, so line 14 in the
 * PDF is line 14 in Word.
 */

import type { PageLayout } from '@shared/types';
import { median } from './paragraphs';

/** Fewer numbers than this in one column is a list, not pleading paper. */
const MIN_NUMBERS = 20;
/** More than this in one column is several mini-pages stacked (a condensed sheet). */
const MAX_NUMBERS = 32;
/** Numbers within this many points of x sit in one column. */
const COLUMN_TOLERANCE = 6;

export interface Pleading {
  /** Baseline-to-baseline distance of the numbered lines, points. */
  pitchPt: number;
  /** Right edge of the number column — what the body's left margin is measured from. */
  numberRight: number;
  /** Baselines of the first (topmost) and last numbered lines. */
  firstBaseline: number;
  lastBaseline: number;
  count: number;
}

/** The layout's pleading column, or null when the page is not pleading paper. */
export function pleadingOf(layout: PageLayout): Pleading | null {
  const numbers = layout.runs.filter(
    (run) => run.role === 'line-number' && /^\d+$/.test(run.text.trim())
  );
  if (numbers.length < MIN_NUMBERS) return null;
  const leftmost = Math.min(...numbers.map((run) => run.x));
  const column = numbers
    .filter((run) => run.x - leftmost <= COLUMN_TOLERANCE)
    .sort((a, b) => b.y - a.y);
  if (column.length < MIN_NUMBERS || column.length > MAX_NUMBERS) return null;
  const gaps = column.slice(1).map((run, index) => (column[index]?.y ?? 0) - run.y);
  const pitchPt = median(gaps.filter((gap) => gap > 0));
  if (pitchPt <= 0) return null;
  return {
    pitchPt,
    numberRight: Math.max(...column.map((run) => run.x + run.width)),
    firstBaseline: column[0]?.y ?? 0,
    lastBaseline: column.at(-1)?.y ?? 0,
    count: column.length,
  };
}

export const LINE_NUMBERS_NOTE =
  'Line numbers printed beside the text were left out; they were not a pleading-paper column Word could reproduce.';

export const PLEADING_NOTE =
  'Pleading line numbers are produced by Word’s own line numbering (Layout › Line Numbers), so they stay right as the text is edited.';

/**
 * Reading order for a two-column page. Lines are read top to bottom — except
 * where the text runs in two columns, in which case the left column is read to
 * its foot before the right column starts. Interleaving the two is the classic
 * PDF-to-Word failure: every line of the left column stitched to the line
 * beside it in the right.
 *
 * Decided on RUNS, before they are clustered into lines, because a line
 * clustered across the gutter would already be one line. A two-column page is
 * told from a two-column table by width: page columns are wide, cells are not.
 */

import type { LayoutTextRun } from '@shared/types';
import type { BodyFrame } from './model';

/** Fewer distinct baselines than this on a side is a margin note, not a column. */
const MIN_COLUMN_LINES = 3;
/** Each column must cover at least this share of the body's height, or it is a caption table. */
const MIN_COLUMN_HEIGHT_SHARE = 0.5;
/** Each column must be at least this share of the body width, or it is a table. */
const MIN_COLUMN_SHARE = 0.25;
/** Where a gutter may fall, as fractions of the body width. */
const GUTTER_CANDIDATES = [0.5, 0.45, 0.55, 0.4, 0.6];

function crosses(run: LayoutTextRun, gutter: number): boolean {
  return run.x < gutter - 2 && run.x + run.width > gutter + 2;
}

function heightOf(runs: readonly LayoutTextRun[]): number {
  if (runs.length === 0) return 0;
  return Math.max(...runs.map((run) => run.y)) - Math.min(...runs.map((run) => run.y));
}

function isColumn(runs: readonly LayoutTextRun[], minWidth: number, minHeight: number): boolean {
  const baselines = new Set(runs.map((run) => Math.round(run.y)));
  const widest = Math.max(0, ...runs.map((run) => run.width));
  return baselines.size >= MIN_COLUMN_LINES && widest >= minWidth && heightOf(runs) >= minHeight;
}

/** The x of a gutter no run crosses, with a real column either side, or null. */
export function findGutter(runs: readonly LayoutTextRun[], frame: BodyFrame): number | null {
  const span = frame.textRight - frame.left;
  const minHeight = MIN_COLUMN_HEIGHT_SHARE * heightOf(runs);
  for (const fraction of GUTTER_CANDIDATES) {
    const gutter = frame.left + span * fraction;
    if (runs.some((run) => crosses(run, gutter))) continue;
    const left = runs.filter((run) => run.x + run.width <= gutter);
    const right = runs.filter((run) => run.x >= gutter);
    if (
      isColumn(left, MIN_COLUMN_SHARE * span, minHeight) &&
      isColumn(right, MIN_COLUMN_SHARE * span, minHeight)
    ) {
      return gutter;
    }
  }
  return null;
}

/** The runs split into reading-order columns: one group, or left then right. */
export function columnsOf(runs: readonly LayoutTextRun[], frame: BodyFrame): LayoutTextRun[][] {
  const gutter = findGutter(runs, frame);
  if (gutter === null) return [[...runs]];
  return [runs.filter((run) => run.x + run.width <= gutter), runs.filter((run) => run.x >= gutter)];
}

/**
 * A scan is never quite square on the glass: a recognised line's words step
 * down a fraction of a point each, and the last of them sit further below the
 * first than the baseline tolerance allows. Left as a line of their own they
 * pushed everything under them down the Word page (a scanned pleading was
 * 7 pt low by mid-page). A recognised word is therefore measured against the
 * last word its line took in, not the first, within a reach no second line
 * comes inside. Typed text keeps the strict tolerance.
 */

import type { LayoutTextRun } from '@shared/types';

/** A tilted line may fall this far (× size) from end to end and still be one line. */
const SKEW_REACH = 0.8;

export interface LineSoFar {
  /** The first (highest) baseline the line took in. */
  baseline: number;
  /** The lowest baseline taken in so far: where the tilted line has got to. */
  low: number;
  sizePt: number;
  runs: readonly LayoutTextRun[];
}

export function onTiltedLine(line: LineSoFar, run: LayoutTextRun, tolerance: number): boolean {
  if (run.hidden !== true || line.runs.some((member) => member.hidden !== true)) return false;
  const size = Math.max(run.sizePt, line.sizePt);
  return line.low - run.y <= tolerance && line.baseline - run.y <= SKEW_REACH * size;
}

/**
 * Columns of text without a drawn grid — a fee schedule, a caption block, an
 * exhibit index — become tab stops, which is how a typist would have set them.
 * A real ruled table is not rebuilt yet; the lines still come through as
 * tab-separated text, and the note says so.
 */

import type { LayoutRule } from '@shared/types';
import type { BodyFrame, Line, TableParagraph } from './model';

export interface RuledTables {
  tables: TableParagraph[];
  /** The lines that landed inside a table — they leave the paragraph flow. */
  consumed: ReadonlySet<Line>;
}

/**
 * Ruled tables on the page, rebuilt from the rule grid: rows where horizontal
 * rules run, columns where vertical rules run, each line assigned to the cell
 * it sits in. Not built yet — the tables lane owns this file.
 */
export function ruledTablesOf(
  _lines: readonly Line[],
  _rules: readonly LayoutRule[],
  _frame: BodyFrame
): RuledTables {
  return { tables: [], consumed: new Set() };
}

/** Cell edges closer than this are the same tab stop. */
const SAME_STOP = 4;

/** Every cell boundary after the first, from the frame's left edge, merged within SAME_STOP. */
export function tabStopsOf(lines: readonly Line[], frame: BodyFrame): number[] {
  const edges = lines
    .flatMap((line) => line.cells.slice(1).map((cell) => cell.x - frame.left))
    .filter((edge) => edge > 0)
    .sort((a, b) => a - b);
  const stops: number[] = [];
  for (const edge of edges) {
    const last = stops.at(-1);
    if (last === undefined || edge - last > SAME_STOP) stops.push(edge);
  }
  return stops;
}

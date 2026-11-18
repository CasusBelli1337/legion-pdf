/**
 * The widest a paragraph may be before Word could pull a line's first word up
 * onto the line above it.
 *
 * A line carries its runs' text and its two edges, not a width per word, so
 * the first word's width is its share of the line — weighed letter by letter
 * (font-widths.ts), not counted: by the count "parties’" was a tenth too
 * wide, the ceiling sat five points too high, and the word fitted on the end
 * of the line above with a third of a point to spare.
 */

import { relativeWidth } from './font-widths';
import type { Line } from './model';

const SPACE = ' ';
/**
 * A word's share of its line is right to about one part in twenty (the face
 * is not Times, the line's spaces are stretched): the ceiling keeps that much
 * of the word in hand, or a two-letter word slips under it by a hair.
 */
const SHARE_ERROR = 0.06;

/** Points per unit of relative width on this line's first cell, or 0 when it has no text. */
function pointsPerUnit(line: Line): number {
  const cell = line.cells[0];
  if (cell === undefined) return 0;
  const units = relativeWidth(cell.runs.map((run) => run.text).join(''));
  const right = line.cells[1]?.x ?? line.right;
  return units === 0 ? 0 : (right - cell.x) / units;
}

/** How wide the line's first word is, points. */
export function firstWordWidth(line: Line): number {
  const text = line.cells[0]?.runs[0]?.text ?? '';
  const word = text.trimStart().split(/\s/)[0] ?? '';
  return relativeWidth(word) * pointsPerUnit(line);
}

/**
 * Just short of the tightest fit: for each line, its right edge plus a space
 * plus the first word of the line under it. The space is the face's own where
 * the line says (a quarter em at least — a justified line's are stretched).
 */
export function wrapCeiling(lines: readonly Line[]): number {
  let ceiling = Number.POSITIVE_INFINITY;
  lines.slice(1).forEach((line, index) => {
    const above = lines[index];
    if (above === undefined) return;
    const space = Math.max(0.25 * line.sizePt, relativeWidth(SPACE) * pointsPerUnit(above));
    ceiling = Math.min(ceiling, above.right + space + (1 - SHARE_ERROR) * firstWordWidth(line));
  });
  return ceiling;
}

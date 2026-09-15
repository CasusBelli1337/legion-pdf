/**
 * Columns of text without a drawn grid — a fee schedule, a caption block, an
 * exhibit index — become tab stops, which is how a typist would have set them.
 * A real ruled table is not rebuilt yet; the lines still come through as
 * tab-separated text, and the note says so.
 */

import type { BodyFrame, Line } from './model';

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

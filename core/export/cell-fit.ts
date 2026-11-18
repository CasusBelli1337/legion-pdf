/**
 * A table cell's lines, held inside the row they were ruled into.
 *
 * A row's height is exact — it is what keeps the table, and the page under
 * it, where the PDF had them — and Word cuts off whatever a cell holds past
 * it. A cell's lines can come to a hair more than the row: a scan's lines set
 * solid at 10.6 pt carry a recognised size of 11, and a line box is never
 * made tighter than its type, so eight of them end three points low and the
 * last loses its descenders to the row's edge. When the lines overrun by
 * little enough to be that, each gives up its share.
 */

import type { TextParagraph } from './model';

/** An overrun past this share of the lines' own height is not rounding; the cell is left as it is. */
const MAX_SQUEEZE = 0.1;
/** Less than this, points, is not an overrun. */
const TOLERANCE = 0.05;

const linesHeight = (paragraph: TextParagraph): number =>
  Math.max(1, paragraph.lines.length) * paragraph.leadingPt;

/**
 * Tightens the paragraphs' line boxes, in proportion, until the cell's flow
 * — every space-before and every line box, from `top` — ends at or above
 * `bottom`. Does nothing when it already fits, or would need more than a
 * tenth off every line.
 */
export function fitToRow(paragraphs: readonly TextParagraph[], top: number, bottom: number): void {
  const lines = paragraphs.reduce((sum, paragraph) => sum + linesHeight(paragraph), 0);
  const spaces = paragraphs.reduce((sum, paragraph) => sum + paragraph.spaceBeforePt, 0);
  const overrun = lines + spaces - (top - bottom);
  if (overrun <= TOLERANCE || lines <= 0 || overrun > MAX_SQUEEZE * lines) return;
  const share = 1 - overrun / lines;
  for (const paragraph of paragraphs) paragraph.leadingPt *= share;
}

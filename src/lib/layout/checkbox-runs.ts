/**
 * A form's checkbox is drawn, not typed: a small stroked square, crossed when
 * ticked. Left as a drawing it has no place in a document of flowing text, so
 * each becomes a box character on the line it sat on — the character Word's
 * own checkbox uses, in the face Word sets it in — and travels with that line.
 */

import { CHECKBOX_CHECKED, CHECKBOX_EMPTY } from '@shared/layout-model';
import type { LayoutCheckbox, LayoutFont, LayoutTextRun } from '@shared/types';

export const CHECKBOX_FONT_KEY = 'legion-checkbox';
/** The face Word's own checkbox control sets ☐ and ☒ in; it ships with Word on Windows and Mac. */
export const CHECKBOX_FONT: LayoutFont = {
  name: 'MS Gothic',
  family: 'sans-serif',
  bold: false,
  italic: false,
};

/** A box sits on a line whose baseline is between a quarter below its foot and its middle. */
const BELOW = 0.25;
const ABOVE = 0.6;
/** With no text beside it, the box's baseline is this far (× its height) above its foot. */
const LONE_BASELINE = 0.12;

/** The text run the box sits beside: on its line, and nearest to it. */
function hostOf(box: LayoutCheckbox, runs: readonly LayoutTextRun[]): LayoutTextRun | null {
  const { x, y, width, height } = box.rect;
  let host: LayoutTextRun | null = null;
  let nearest = Number.POSITIVE_INFINITY;
  for (const run of runs) {
    if (run.text.trim() === '' || run.hidden === true) continue;
    if (run.y < y - BELOW * height || run.y > y + ABOVE * height) continue;
    const distance = Math.max(run.x - (x + width), x - (run.x + run.width), 0);
    if (distance < nearest) {
      nearest = distance;
      host = run;
    }
  }
  return host;
}

/** One box character per checkbox, placed and sized like the text beside it. */
export function checkboxRuns(
  boxes: readonly LayoutCheckbox[],
  runs: readonly LayoutTextRun[]
): LayoutTextRun[] {
  return boxes.map((box) => {
    const host = hostOf(box, runs);
    return {
      text: box.checked ? CHECKBOX_CHECKED : CHECKBOX_EMPTY,
      x: box.rect.x,
      y: host?.y ?? box.rect.y + LONE_BASELINE * box.rect.height,
      width: box.rect.width,
      sizePt: host?.sizePt ?? box.rect.height,
      fontKey: CHECKBOX_FONT_KEY,
      colorHex: '#000000',
      role: host?.role ?? 'body',
      eol: false,
      ...(host?.block === undefined ? {} : { block: host.block }),
    };
  });
}

/**
 * Lines Word's own numbering must count the way the page did: an empty
 * paragraph wherever a printed number had no text beside it, and no count at
 * all for text that had no number beside it (footnotes).
 */

import type { LayoutTextRun, PageLayout } from '@shared/types';
import { BASELINE_SHARE } from './model';
import type { TextParagraph } from './model';
import type { Pleading } from './pleading';

/** An empty paragraph exactly one line box tall. */
export function blankLine(pitchPt: number): TextParagraph {
  return {
    kind: 'text',
    lines: [],
    alignment: 'left',
    leadingPt: pitchPt,
    indentLeftPt: 0,
    indentRightPt: 0,
    firstLinePt: 0,
    spaceBeforePt: 0,
    tabStops: [],
    top: 0,
  };
}

/** A body run sits on this baseline, within a couple of points (a few, when recognised). */
function hasTextAt(layout: PageLayout, y: number): boolean {
  return layout.runs.some(
    (run) =>
      run.role === 'body' &&
      run.text.trim().length > 0 &&
      Math.abs(run.y - y) <= (run.hidden === true ? 4 : 2)
  );
}

/** An empty paragraph is never set shorter than this, points. */
const MIN_BLANK = 0.25;

/**
 * How tall an empty numbered line can be and still put its number where the
 * page did: its box starts where the line above ended. A regular blank comes
 * out one pitch tall; the sliver of an empty paragraph Word left under a
 * signature block (its number 4.8 pt below the last line's) comes out a
 * sliver, instead of a full line that pushes the text above it out of place.
 */
function roomUnder(numbers: readonly LayoutTextRun[], index: number, pitchPt: number): number {
  const run = numbers[index];
  const above = numbers[index - 1];
  if (run === undefined || above === undefined) return Number.POSITIVE_INFINITY;
  const higher = numbers[index - 2];
  const abovePitch = higher === undefined ? pitchPt : Math.min(pitchPt, higher.y - above.y);
  const aboveBottom = above.y - (1 - BASELINE_SHARE) * abovePitch;
  return Math.max(MIN_BLANK, (aboveBottom - run.y) / BASELINE_SHARE);
}

/**
 * When the numbers followed the text (Word's own numbering), a printed number
 * with no text beside it was an empty paragraph, and Word must be given one
 * of the same height there so its numbering counts the same lines.
 */
export function numberedBlanks(layout: PageLayout, pleading: Pleading): TextParagraph[] {
  const numbers = layout.runs
    .filter((run) => run.role === 'line-number' && /^\d{1,2}$/.test(run.text.trim()))
    .sort((a, b) => b.y - a.y);
  return numbers.flatMap((run, index) => {
    if (hasTextAt(layout, run.y)) return [];
    const next = numbers[index + 1];
    const below = next === undefined ? pleading.pitchPt : run.y - next.y;
    const leading = Math.min(below, roomUnder(numbers, index, pleading.pitchPt));
    const blank = blankLine(leading);
    blank.top = run.y + BASELINE_SHARE * leading;
    return [blank];
  });
}

/** A lone footnote line's box, × its type size: single spacing. */
const FOOTNOTE_PITCH = 1.2;

/**
 * Paragraphs with no printed number beside any of their lines — footnotes.
 * Where the numbers followed the text, Word's numbering must skip them too,
 * or it counts lines the page did not. And a one-line footnote under the last
 * number takes a single-spaced box: on the body's double pitch its box
 * reaches below the page's last line, and Word carries it to the next page.
 */
export function markUnnumbered(paragraphs: readonly TextParagraph[], layout: PageLayout): void {
  const numbers = layout.runs.filter((run) => run.role === 'line-number').map((run) => run.y);
  const lastNumber = Math.min(...numbers);
  for (const paragraph of paragraphs) {
    const [first] = paragraph.lines;
    const numbered = paragraph.lines.some((line) =>
      numbers.some((y) => Math.abs(y - line.baseline) <= 2)
    );
    if (first === undefined || numbered) continue;
    paragraph.unnumbered = true;
    if (paragraph.lines.length === 1 && first.baseline < lastNumber - 2) {
      paragraph.leadingPt = Math.min(paragraph.leadingPt, FOOTNOTE_PITCH * first.sizePt);
    }
  }
}

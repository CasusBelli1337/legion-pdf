/**
 * Dot leaders a producer wrote INSIDE one run: Acrobat PDFMaker hands a table
 * of contents entry back as "Introduction ........ 1" — entry, dots and page
 * number in a single text item. Left whole, the dots are literal text whose
 * width in Word differs from the PDF's by a hair, and the page number drops
 * onto a line of its own. Split here, the dots become a right tab's leader
 * (lines.ts) and the number sits at the tab, wherever the entry ends.
 */

import type { LayoutTextRun } from '@shared/types';

/** Entry and dots, then what follows the dots: a page number, "passim", "5, 7". */
const INTERIOR_LEADER = /^(.*\.{5,}[.\s·…]*)([^.\s·…].*)$/;
/** The text after a leader is a page reference, never a sentence. */
const MAX_TAIL = 14;
/** A digit or letter is about half an em wide — enough to place the tail's left edge. */
const TAIL_ADVANCE = 0.5;

/**
 * The run as its parts either side of an interior leader: the entry with its
 * dots (lines.ts strips them and remembers the leader), then the page number
 * ending where the run ended. Any other run comes back alone.
 */
export function leaderParts(run: LayoutTextRun): LayoutTextRun[] {
  const match = INTERIOR_LEADER.exec(run.text);
  const head = match?.[1];
  const tail = match?.[2]?.trimEnd();
  if (head === undefined || tail === undefined || tail.length > MAX_TAIL) return [run];
  const tailWidth = Math.min(run.width / 2, tail.length * TAIL_ADVANCE * run.sizePt);
  return [
    { ...run, text: head, width: run.width - tailWidth },
    { ...run, text: tail, x: run.x + run.width - tailWidth, width: tailWidth },
  ];
}

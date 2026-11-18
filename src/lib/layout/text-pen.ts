/**
 * Where the text pen is — see `Pen`. Kept apart from wide-spaces.ts, which
 * only asks one thing of it: is the pen still against the space it just drew?
 */

import type { GlyphLike } from './wide-spaces';

/**
 * The text pen, followed just far enough to know whether a space drawn after
 * a move sits against the one drawn before it. Producers that place every
 * chunk of a line with its own matrix split a typed pair across two operators
 * with a move that changes nothing between them; a filler line "/ / /" is
 * drawn "/␣", a move to where the next slash belongs, "␣/" — two spaces in the
 * stream, one on the page.
 */
export interface Pen {
  /** The font size the widths are scaled by, and the text matrix's scale and origin on the page. */
  size: number;
  scale: number;
  originX: number;
  originY: number;
  /** Where the line began and where the next glyph goes, in the text's own units from the origin. */
  lineX: number;
  lineY: number;
  x: number;
  /** Where the next glyph goes, on the page. */
  at: { x: number; y: number };
  /** The last glyph drawn was a space, and the pen is still against it. */
  spaced: boolean;
}

/** A move that leaves the pen within this (× the size on the page) of where it was changes nothing. */
const STILL = 0.05;

export function newPen(): Pen {
  const origin = { originX: 0, originY: 0, lineX: 0, lineY: 0, x: 0 };
  return { size: 1, scale: 1, ...origin, at: { x: 0, y: 0 }, spaced: false };
}

/** The pen set down at a place of the operator's choosing: still against a space only if it has not really moved. */
function setDown(pen: Pen, x: number, y: number): void {
  const reach = STILL * Math.abs(pen.size * pen.scale);
  const still = Math.abs(x - pen.at.x) <= reach && Math.abs(y - pen.at.y) <= reach;
  pen.spaced = pen.spaced && still;
  pen.at = { x, y };
}

/** A text object opens on an identity matrix; where the pen was is remembered until it is set down. */
function liftPen(pen: Pen): void {
  Object.assign(pen, { scale: 1, originX: 0, originY: 0, lineX: 0, lineY: 0, x: 0 });
}

/** A text matrix: the line starts at its origin. */
function placePen(pen: Pen, matrix: unknown): void {
  const [a, b, , , e, f] = Array.isArray(matrix) ? (matrix as unknown[]) : [];
  if (typeof a !== 'number' || typeof e !== 'number' || typeof f !== 'number') {
    pen.spaced = false;
    return;
  }
  liftPen(pen);
  Object.assign(pen, {
    scale: Math.hypot(a, typeof b === 'number' ? b : 0),
    originX: e,
    originY: f,
  });
  setDown(pen, e, f);
}

/** A move along (or off) the line: measured from the line's start, not from the pen. */
function movePen(pen: Pen, x: unknown, y: unknown): void {
  pen.lineX += typeof x === 'number' ? x : 0;
  pen.lineY += typeof y === 'number' ? y : 0;
  pen.x = pen.lineX;
  setDown(pen, pen.originX + pen.scale * pen.x, pen.originY + pen.scale * pen.lineY);
}

/** The pen after a show-text: advanced by every glyph, pulled back by the kerning between them. */
export function showWithPen(pen: Pen, glyphs: unknown, endsSpaced: boolean): void {
  if (!Array.isArray(glyphs)) return;
  for (const glyph of glyphs as (GlyphLike | number | null)[]) {
    if (typeof glyph === 'number') pen.x -= (glyph * pen.size) / 1000;
    else if (typeof glyph?.width === 'number') pen.x += (glyph.width * pen.size) / 1000;
  }
  pen.at = { x: pen.originX + pen.scale * pen.x, y: pen.originY + pen.scale * pen.lineY };
  pen.spaced = endsSpaced;
}

/** The operators that move the pen, by pdfjs name; op-walk.ts hands each its arguments. */
export const PEN_OPS: Readonly<Record<string, (pen: Pen, args: readonly unknown[]) => void>> = {
  beginText: (pen) => liftPen(pen),
  setTextMatrix: (pen, [matrix]) => placePen(pen, matrix),
  moveText: (pen, [x, y]) => movePen(pen, x, y),
  setLeadingMoveText: (pen, [x, y]) => movePen(pen, x, y),
  // The leading is not followed: after a bare next-line nothing is against anything.
  nextLine: (pen) => {
    pen.spaced = false;
  },
  setFont: (pen, [, size]) => {
    if (typeof size === 'number') pen.size = size;
  },
};

/**
 * The caption box that is not a box. See `captionGridOf`.
 */

import type { LayoutRule } from '@shared/types';
import { BASELINE_SHARE } from './model';
import type { BodyFrame, Line } from './model';
import { medianLeading } from './paragraphs';
import type { Edge, Grid } from './table-grid';
import { edgesIn, outerSpan, reaches } from './table-grid';

/**
 * The commonest California caption box is not a box at all: one vertical rule
 * between the parties and the case number, and one rule under the LEFT cell
 * only — an L. There is no closed grid to find, so the text is the evidence:
 * a rule with a column of lines running down BOTH sides of it, for its whole
 * height, closed at the foot. Fewer lines than this and it is a stray mark —
 * unless the few there are run most of the rule's height (a court's own order
 * sets three lines of parties beside five of title).
 */
const MIN_CAPTION_LINES = 6;
const MIN_SIDE_LINES = 2;
/** Share of the rule's height a short caption's lines must run. */
const SHORT_CAPTION_REACH = 0.5;
/** How near the foot rule has to come to the end of the upright one. */
const MEETS = 3;
/** Air between the caption's text and the edges its rules never drew. */
const CAPTION_AIR = 2;
/** A last line whose baseline is this close under the foot rule, points, still sits in the box. */
const SITS_ON_FOOT = 3;
/** Air between the last line's box and the foot drawn under it, points. */
const FOOT_AIR = 1;
/** No cell of a caption is narrower than an em. */
const MIN_CAPTION_CELL = 12;

function sideCount(lines: readonly Line[], test: (x: number) => boolean): number {
  return lines.filter((line) => line.cells.some((cell) => test(cell.x))).length;
}

/** True when lines run down both sides of an upright rule at `at`, `height` points tall. */
function flanked(inside: readonly Line[], at: number, height: number): boolean {
  const sides = [sideCount(inside, (x) => x < at), sideCount(inside, (x) => x > at)];
  if (sides.every((count) => count >= MIN_CAPTION_LINES)) return true;
  const total = sides.reduce((sum, count) => sum + count, 0);
  if (total < MIN_CAPTION_LINES || sides.some((count) => count < MIN_SIDE_LINES)) return false;
  const baselines = inside.map((line) => line.baseline);
  return Math.max(...baselines) - Math.min(...baselines) >= SHORT_CAPTION_REACH * height;
}

/** The top of the text, the way settlePage measures a paragraph's box. */
function textTop(lines: readonly Line[]): number {
  const leading = medianLeading(lines);
  return Math.max(...lines.map((line) => line.baseline + BASELINE_SHARE * leading));
}

/** The rule closing the foot of the upright one: level with its lower end, and reaching it. */
function footOf(rule: Edge, levels: readonly Edge[]): Edge | undefined {
  const span = outerSpan(rule);
  return levels.find((edge) => {
    const reach = outerSpan(edge);
    return (
      Math.abs(edge.at - span.from) <= MEETS && reach.from <= rule.at && reach.to >= rule.at - MEETS
    );
  });
}

/**
 * Rules across the left cell between the upright rule's ends — the line a
 * caption draws between one set of parties and the next. Each makes a row.
 */
function crossRules(rule: Edge, foot: Edge, levels: readonly Edge[]): Edge[] {
  const span = outerSpan(rule);
  return levels
    .filter((edge) => {
      const reach = outerSpan(edge);
      const between = edge.at > foot.at + MEETS && edge.at < span.to - MEETS;
      return between && reach.to >= rule.at - MEETS && reach.from <= rule.at - MIN_CAPTION_CELL;
    })
    .sort((a, b) => b.at - a.at);
}

/**
 * Where the box ends: at its foot rule, or just under the last line's own box
 * when that reaches lower. A scan's last line can sit on the rule itself; a
 * row cut at the rule cut the line's descenders off with it.
 */
function footEdge(foot: Edge, inside: readonly Line[]): number {
  const lowest = Math.min(...inside.map((line) => line.baseline));
  return Math.min(foot.at, lowest - (1 - BASELINE_SHARE) * medianLeading(inside) - FOOT_AIR);
}

/** Recognised text: a scan's words, whose widths in Word are only nearly the scan's. */
function isRecognized(lines: readonly Line[]): boolean {
  return lines.every((line) => line.cells.every((cell) => cell.runs.every((run) => run.hidden)));
}

function captionAt(rule: Edge, levels: readonly Edge[], lines: readonly Line[], frame: BodyFrame) {
  const span = outerSpan(rule);
  const foot = footOf(rule, levels);
  if (foot === undefined) return null;
  const inside = lines.filter(
    (line) => line.baseline > foot.at - SITS_ON_FOOT && line.baseline <= span.to
  );
  if (!flanked(inside, rule.at, span.to - foot.at)) return null;
  const left = Math.min(frame.left, Math.min(...inside.map((line) => line.x)) - CAPTION_AIR);
  const textRight = Math.max(...inside.map((line) => line.right)) + CAPTION_AIR;
  // The right cell has no rule of its own to stop at; a scan's words get the
  // whole margin, so one set a hair wider than it was scanned still fits.
  const right = isRecognized(inside) ? Math.max(textRight, frame.right) : textRight;
  if (rule.at - left < MIN_CAPTION_CELL || right - rule.at < MIN_CAPTION_CELL) return null;
  const rows = [...crossRules(rule, foot, levels), foot];
  const edges = rows.map((edge) => edge.at);
  return {
    columnEdges: [left, rule.at, right],
    rowEdges: [Math.max(span.to, textTop(inside)), ...edges.slice(0, -1), footEdge(foot, inside)],
    borders: {
      // Only the upright rule and the rules under the left cell were drawn,
      // unless one runs on under the right cell too.
      horizontal: [
        [false, false],
        ...rows.map((edge) => [true, reaches(edge, rule.at, textRight)]),
      ],
      vertical: rows.map(() => [false, true, false]),
    },
  };
}

/** The caption box drawn as an L, or null when these rules are not one. */
export function captionGridOf(
  rules: readonly LayoutRule[],
  lines: readonly Line[],
  frame: BodyFrame
): Grid | null {
  const { horizontal, vertical } = edgesIn(rules);
  for (const rule of vertical) {
    const grid = captionAt(rule, horizontal, lines, frame);
    if (grid !== null) return grid;
  }
  return null;
}

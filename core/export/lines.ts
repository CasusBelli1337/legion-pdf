/**
 * From the runs pdfjs reported to the lines an attorney reads. pdfjs hands text
 * back in content-stream order, split wherever the font or the show operator
 * changed, with spaces sometimes drawn and sometimes only implied by a gap. So
 * runs are clustered by baseline, sorted left to right, and re-joined: a gap the
 * width of a space becomes a space, a gap the width of several becomes a column
 * boundary, and a style change stays a run boundary so a bold word inside a
 * sentence stays bold.
 */

import type { LayoutRule, LayoutTextRun } from '@shared/types';
import { columnsOf } from './columns';
import { leaderParts } from './leaders';
import {
  DOT_LEADER,
  TRAILING_LEADER,
  dominantSize,
  opensCell,
  placeRun,
  standsAlone,
  withCellSizes,
  withoutTrailingLeader,
} from './line-cells';
import type { Cursor } from './line-cells';
import { tabbedAfterMarker } from './list-marker';
import type { BodyFrame, Cell, Line, StyledRun } from './model';
import { hexColor } from './styles';
import { onTiltedLine } from './tilted-line';
import { isUnderlined, underlineRules } from './underline';

export { sameStyle } from './line-cells';
export { isUnderlined } from './underline';

/** Two runs share a baseline within this fraction of the type size. */
const BASELINE_TOLERANCE = 0.35;
/** A run this much smaller than the line (× size), raised this much (× size), is a superscript. */
const SUPERSCRIPT_SIZE = 0.8;
const SUPERSCRIPT_RISE = 0.15;

interface Draft {
  baseline: number;
  sizePt: number;
  runs: LayoutTextRun[];
  /** The lowest baseline taken in so far (tilted-line.ts). */
  low: number;
}

function styled(
  run: LayoutTextRun,
  rules: readonly LayoutRule[],
  line: { baseline: number; sizePt: number }
): StyledRun {
  const superscript =
    run.sizePt < SUPERSCRIPT_SIZE * line.sizePt &&
    run.y - line.baseline > SUPERSCRIPT_RISE * line.sizePt;
  // An OCR layer's size is a box height, not a type size: it takes the line's,
  // to the half point, so a recognised line is one size in Word.
  const sizePt = run.hidden === true ? Math.round(line.sizePt * 2) / 2 : run.sizePt;
  return {
    text: run.text,
    fontKey: run.fontKey,
    // Word sizes a superscript itself; the run keeps the line's size.
    sizePt: superscript ? line.sizePt : sizePt,
    colorHex: hexColor(run.colorHex),
    underline: isUnderlined(run, rules),
    hidden: run.hidden === true,
    ...(superscript ? { superscript: true } : {}),
  };
}

function onBaseline(draft: Draft, run: LayoutTextRun): boolean {
  const tolerance = Math.max(1.5, BASELINE_TOLERANCE * Math.max(run.sizePt, draft.sizePt));
  return Math.abs(run.y - draft.baseline) <= tolerance || onTiltedLine(draft, run, tolerance);
}

/** A raised reference sits at most this far (× the line's size) above the line it marks. */
const RAISED_REACH = 0.6;

/**
 * A footnote reference raised further than the baseline tolerance (Word lifts
 * an 8 pt mark 4.5 pt over 12 pt text) clusters alone, above its line. It is
 * part of that line: left alone it became a paragraph of its own, one line
 * taller than the page had room for.
 */
function joinRaised(drafts: Draft[]): Draft[] {
  const joined: Draft[] = [];
  drafts.forEach((draft, index) => {
    const below = drafts[index + 1];
    const rise = below === undefined ? 0 : draft.baseline - below.baseline;
    const small =
      below !== undefined &&
      draft.runs.every((run) => run.sizePt < SUPERSCRIPT_SIZE * below.sizePt);
    if (below !== undefined && small && rise > 0 && rise <= RAISED_REACH * below.sizePt) {
      below.runs.push(...draft.runs);
    } else joined.push(draft);
  });
  return joined;
}

/** Runs grouped by baseline, top of the page first. Whitespace-only runs are noise. */
function clusterByBaseline(runs: readonly LayoutTextRun[]): Draft[] {
  const drafts: Draft[] = [];
  const ordered = runs
    .filter((run) => run.text.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  for (const run of ordered) {
    const draft = drafts.at(-1);
    if (draft !== undefined && onBaseline(draft, run)) {
      draft.runs.push(run);
      draft.low = Math.min(draft.low, run.y);
    } else drafts.push({ baseline: run.y, sizePt: run.sizePt, runs: [run], low: run.y });
  }
  return joinRaised(drafts);
}

/**
 * The baseline of the text that IS the line: the character-weighted median of
 * the runs at its dominant size, so a raised footnote number never lifts the
 * line it sits on.
 */
function baselineOf(runs: readonly LayoutTextRun[], sizePt: number): number {
  const weighted: { y: number; weight: number }[] = runs
    .filter((run) => Math.abs(run.sizePt - sizePt) <= 0.5)
    .map((run) => ({ y: run.y, weight: run.text.trim().length }))
    .sort((a, b) => a.y - b.y);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let seen = 0;
  for (const entry of weighted) {
    seen += entry.weight;
    if (seen * 2 >= total) return entry.y;
  }
  return runs[0]?.y ?? 0;
}

/** Characters per tagged block across the runs, and the cells those blocks sit in. */
function blockWeights(runs: readonly LayoutTextRun[]) {
  const weight = new Map<string, number>();
  const cells = new Set<string>();
  let total = 0;
  for (const run of runs) {
    total += run.text.length;
    if (run.block === undefined) continue;
    cells.add(run.block.id.split('/')[0] ?? '');
    weight.set(run.block.id, (weight.get(run.block.id) ?? 0) + run.text.length);
  }
  return { weight, cells, total };
}

/**
 * The block most of the line's characters belong to, or null when untagged
 * or split. A baseline shared by two table cells (a caption's party names
 * beside its case number) is two paragraphs side by side, which the flow
 * cannot express as one tagged paragraph; such a line is left to geometry.
 * A paragraph inside one cell sits beside another cell's paragraphs, and the
 * flow can only place such lines one baseline at a time: each line of a cell
 * is its own block until cells become Word table cells.
 */
function blockIdOf(runs: readonly LayoutTextRun[]): string | null {
  const { weight, cells, total } = blockWeights(runs);
  if (cells.size > 1) return null;
  const top = [...weight.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top === undefined || top[1] < 0.6 * total) return null;
  return top[0].includes('/') ? `${top[0]}@${Math.round((runs[0]?.y ?? 0) * 10)}` : top[0];
}

/** The page's rules, and the ones among them that can be underlines (underline.ts). */
interface Marks {
  rules: readonly LayoutRule[];
  underlines: readonly LayoutRule[];
}

/** One line's runs, left to right, joined into cells with spaces where the gaps say so. */
function assemble(draft: Draft, marks: Marks): Line {
  const { rules } = marks;
  const ordered = [...draft.runs].sort((a, b) => a.x - b.x).flatMap(leaderParts);
  const sizePt = dominantSize(ordered);
  const line = { baseline: baselineOf(ordered, sizePt), sizePt };
  const cells: Cell[] = [];
  const cursor: Cursor = { right: Number.NEGATIVE_INFINITY, leader: false, box: false };
  const led = ordered.some((run) => DOT_LEADER.test(run.text) || TRAILING_LEADER.test(run.text));
  for (const run of ordered) {
    if (DOT_LEADER.test(run.text) && cells.length > 0) {
      // The dots are not text; the cell after them is a right-tabbed page number.
      cursor.leader = true;
    } else {
      const { text, leads } = withoutTrailingLeader(run.text);
      // A table of contents' entry keeps its number and title in one cell before the leader.
      const opens =
        opensCell(run, cursor, rules, line.baseline) ||
        (!led && tabbedAfterMarker(cells, run, cursor.right));
      placeRun(cells, run, styled({ ...run, text }, marks.underlines, line), cursor, opens);
      cursor.leader = leads;
      cursor.box = standsAlone(run);
    }
    cursor.right = Math.max(cursor.right, run.x + run.width);
  }
  const first = ordered[0];
  return {
    cells: withCellSizes(cells, ordered, sizePt),
    baseline: line.baseline,
    x: first?.x ?? 0,
    right: cursor.right,
    sizePt,
    blockId: blockIdOf(ordered),
  };
}

/**
 * The page's runs as lines in reading order — top to bottom, and on a
 * two-column page the left column before the right (which needs the body
 * frame). Rules mark which runs are underlined.
 */
export function linesOf(
  runs: readonly LayoutTextRun[],
  rules: readonly LayoutRule[] = [],
  frame?: BodyFrame
): Line[] {
  const columns = frame === undefined ? [runs] : columnsOf(runs, frame);
  const marks: Marks = { rules, underlines: underlineRules(rules) };
  return columns.flatMap((column) =>
    clusterByBaseline(column).map((draft) => assemble(draft, marks))
  );
}

/** The line's full text, cells joined with a tab. */
export function lineText(line: Line): string {
  return line.cells.map((cell) => cell.runs.map((run) => run.text).join('')).join('\t');
}

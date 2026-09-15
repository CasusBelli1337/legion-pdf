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
import type { BodyFrame, Cell, Line, StyledRun } from './model';
import { hexColor } from './styles';

/** Two runs share a baseline within this fraction of the type size. */
const BASELINE_TOLERANCE = 0.35;
/** A run this much smaller than the line (× size), raised this much (× size), is a superscript. */
const SUPERSCRIPT_SIZE = 0.8;
const SUPERSCRIPT_RISE = 0.15;
/** A gap this wide (× size) reads as a space between words. */
const SPACE_GAP = 0.18;
/** A gap this wide (× size) reads as a column boundary, not a word space. */
const COLUMN_GAP = 2.2;

interface Draft {
  baseline: number;
  sizePt: number;
  runs: LayoutTextRun[];
}

/** An underline is a thin rule just under the baseline, spanning the run. */
export function isUnderlined(run: LayoutTextRun, rules: readonly LayoutRule[]): boolean {
  const band = Math.max(1, 0.2 * run.sizePt);
  return rules.some(
    (rule) =>
      rule.rect.height <= band &&
      rule.rect.y <= run.y &&
      rule.rect.y >= run.y - band &&
      rule.rect.x <= run.x + 1 &&
      rule.rect.x + rule.rect.width >= run.x + run.width - 1
  );
}

function styled(
  run: LayoutTextRun,
  rules: readonly LayoutRule[],
  line: { baseline: number; sizePt: number }
): StyledRun {
  const superscript =
    run.sizePt < SUPERSCRIPT_SIZE * line.sizePt &&
    run.y - line.baseline > SUPERSCRIPT_RISE * line.sizePt;
  return {
    text: run.text,
    fontKey: run.fontKey,
    // Word sizes a superscript itself; the run keeps the line's size.
    sizePt: superscript ? line.sizePt : run.sizePt,
    colorHex: hexColor(run.colorHex),
    underline: isUnderlined(run, rules),
    hidden: run.hidden === true,
    ...(superscript ? { superscript: true } : {}),
  };
}

/** Two runs that would look identical in Word — the ones that merge into one. */
export function sameStyle(a: StyledRun, b: StyledRun): boolean {
  return (
    a.fontKey === b.fontKey &&
    Math.abs(a.sizePt - b.sizePt) < 0.25 &&
    a.colorHex === b.colorHex &&
    a.underline === b.underline &&
    (a.superscript ?? false) === (b.superscript ?? false)
  );
}

function onBaseline(draft: Draft, run: LayoutTextRun): boolean {
  const tolerance = Math.max(1.5, BASELINE_TOLERANCE * Math.max(run.sizePt, draft.sizePt));
  return Math.abs(run.y - draft.baseline) <= tolerance;
}

/** Runs grouped by baseline, top of the page first. Whitespace-only runs are noise. */
function clusterByBaseline(runs: readonly LayoutTextRun[]): Draft[] {
  const drafts: Draft[] = [];
  const ordered = runs
    .filter((run) => run.text.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  for (const run of ordered) {
    const draft = drafts.at(-1);
    if (draft !== undefined && onBaseline(draft, run)) draft.runs.push(run);
    else drafts.push({ baseline: run.y, sizePt: run.sizePt, runs: [run] });
  }
  return drafts;
}

/** The size most of the line's characters are set in. */
function dominantSize(runs: readonly LayoutTextRun[]): number {
  const weight = new Map<number, number>();
  for (const run of runs) {
    const size = Math.round(run.sizePt * 2) / 2;
    weight.set(size, (weight.get(size) ?? 0) + run.text.length);
  }
  let best = runs[0]?.sizePt ?? 0;
  let bestWeight = -1;
  for (const [size, count] of weight) {
    if (count > bestWeight) {
      best = size;
      bestWeight = count;
    }
  }
  return best;
}

function appendRun(cell: Cell, run: StyledRun, spaced: boolean): void {
  const previous = cell.runs.at(-1);
  if (previous === undefined) {
    cell.runs.push(run);
    return;
  }
  const needsSpace = spaced && !previous.text.endsWith(' ') && !run.text.startsWith(' ');
  if (sameStyle(previous, run)) {
    previous.text += (needsSpace ? ' ' : '') + run.text;
    return;
  }
  if (needsSpace) previous.text += ' ';
  cell.runs.push(run);
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

/** One line's runs, left to right, joined into cells with spaces where the gaps say so. */
function assemble(draft: Draft, rules: readonly LayoutRule[]): Line {
  const ordered = [...draft.runs].sort((a, b) => a.x - b.x);
  const sizePt = dominantSize(ordered);
  const line = { baseline: baselineOf(ordered, sizePt), sizePt };
  const cells: Cell[] = [];
  let cursor = Number.NEGATIVE_INFINITY;
  for (const run of ordered) {
    const gap = run.x - cursor;
    const size = Math.max(run.sizePt, 1);
    const cell = cells.at(-1);
    if (cell === undefined || gap > COLUMN_GAP * size) {
      cells.push({ x: run.x, runs: [styled(run, rules, line)] });
    } else {
      appendRun(cell, styled(run, rules, line), gap > SPACE_GAP * size);
    }
    cursor = Math.max(cursor, run.x + run.width);
  }
  const first = ordered[0];
  return {
    cells,
    baseline: line.baseline,
    x: first?.x ?? 0,
    right: cursor,
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
  return columns.flatMap((column) =>
    clusterByBaseline(column).map((draft) => assemble(draft, rules))
  );
}

/** The line's full text, cells joined with a tab. */
export function lineText(line: Line): string {
  return line.cells.map((cell) => cell.runs.map((run) => run.text).join('')).join('\t');
}

/**
 * From lines to paragraphs: where one ends, how the next is set. Nothing in a
 * PDF says "paragraph" — there are only lines at positions — so this reads the
 * signals a typesetter leaves: a blank line, a first-line indent, a last line
 * that stops short, a change of size, a switch between centred and flush text.
 *
 * Alignment and indents are measured against the BODY FRAME (the section's
 * margins), so a paragraph indented half an inch in the PDF is indented half an
 * inch in Word rather than sitting at a margin Word chose.
 */

import { lineText } from './lines';
import type { Alignment, BodyFrame, Line, TextParagraph } from './model';
import { tabStopsOf } from './tables';

/**
 * Openings that always start a paragraph, whatever the geometry says: a
 * transcript's question and answer, a speaker, a list item. Config over code —
 * a new convention is a new alternative here.
 */
const BLOCK_OPENERS =
  /^(Q[.:]|A[.:]|THE (COURT|WITNESS|REPORTER|CLERK)\b|(MR|MS|MRS|DR)\.\s|BY (MR|MS|MRS|DR)\.|\(\w{1,3}\)\s|\d{1,3}[.)]\s|[•▪‣◦●]\s|[-–—]\s)/;

/** True when the line opens the way a new block of text opens. */
export function startsBlock(line: Line): boolean {
  return BLOCK_OPENERS.test(lineText(line).trimStart());
}

/** A gap this many leadings tall is a blank line, hence a new paragraph. */
const BLANK_LINE = 1.6;
/** A line ending this far (× body width) before the right edge was a last line. */
const SHORT_LINE = 0.25;
/** Edge equality, × type size. */
const EDGE = 0.5;
/** A shift deeper than this between one line's start and the next is never a flow. */
const DEEP_INDENT = 60;
/**
 * Room past a paragraph's widest line before it wraps, points. Word's Times
 * New Roman is a hair wider than the PDF's Times here and there; without this
 * a line that filled the block exactly wraps its last word.
 */
const WRAP_SLACK = 4;

export interface ParagraphOptions {
  frame: BodyFrame;
  /**
   * The pitch a ONE-line paragraph is given (a pleading's line pitch): a lone
   * line says nothing about its own leading, and on numbered paper its box
   * should be one numbered line. Multi-line paragraphs keep their measured
   * pitch — a single-spaced block quote inside a double-spaced brief stays
   * single-spaced.
   */
  leadingPt?: number;
  /** Every line its own paragraph (a transcript), whatever the geometry says. */
  linePerParagraph?: boolean;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/** The typical baseline-to-baseline distance; 1.2 × size when there is one line. */
export function medianLeading(lines: readonly Line[]): number {
  const gaps: number[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (previous === undefined || current === undefined) continue;
    const gap = previous.baseline - current.baseline;
    if (gap > 0 && gap <= 3 * Math.max(previous.sizePt, current.sizePt)) gaps.push(gap);
  }
  const fallback = 1.2 * (lines[0]?.sizePt ?? 12);
  return gaps.length === 0 ? fallback : median(gaps);
}

function isTabular(line: Line): boolean {
  return line.cells.length > 1;
}

/**
 * Equal room either side, and some room — a heading, a caption, a signature
 * line. Measured against the margins and against the text block, since a
 * document set narrower than its margins centres within its own width.
 */
export function isCentered(line: Line, frame: BodyFrame): boolean {
  return [frame.right, frame.textRight].some((right) => {
    const leftGap = line.x - frame.left;
    const rightGap = right - line.right;
    const tolerance = Math.max(2, 0.04 * (right - frame.left));
    const room = 2 * line.sizePt;
    return leftGap > room && rightGap > room && Math.abs(leftGap - rightGap) <= tolerance;
  });
}

interface Neighbours {
  previous: Line;
  current: Line;
  next: Line | undefined;
}

/** The face nearly all of a line is set in, or null when it mixes faces. */
function soleFont(line: Line): string | null {
  const weight = new Map<string, number>();
  let total = 0;
  for (const run of line.cells.flatMap((cell) => cell.runs)) {
    const count = run.text.trim().length;
    weight.set(run.fontKey, (weight.get(run.fontKey) ?? 0) + count);
    total += count;
  }
  const top = [...weight.entries()].sort((a, b) => b[1] - a[1])[0];
  return top !== undefined && top[1] >= 0.95 * total ? top[0] : null;
}

/** A line wholly in one face followed by a line wholly in another: a heading met its text. */
function changesFace({ previous, current }: Neighbours): boolean {
  const before = soleFont(previous);
  const after = soleFont(current);
  return before !== null && after !== null && before !== after;
}

/**
 * Within a paragraph consecutive baselines are one pitch apart. A line whose
 * gap above differs from the regular gap below it (the next two lines agree)
 * begins something new — a heading with its own space sits above it.
 */
function irregularGapAbove(
  { previous, current, next }: Neighbours,
  after: Line | undefined
): boolean {
  if (next === undefined || after === undefined) return false;
  const above = previous.baseline - current.baseline;
  const below = current.baseline - next.baseline;
  const following = next.baseline - after.baseline;
  if (Math.abs(below - following) > 0.05 * below) return false;
  return Math.abs(above - below) > 0.05 * Math.max(above, below);
}

/** An indented line that the NEXT line does not follow at the same x is a first line. */
function startsIndented({ previous, current, next }: Neighbours): boolean {
  const size = Math.max(previous.sizePt, current.sizePt);
  if (current.x <= previous.x + 1.5 * size) return false;
  return next === undefined || next.x < current.x - 1.5 * size;
}

/**
 * A line that stopped short was a paragraph's last line when the next line
 * starts at the same left edge (a new paragraph) or well to the right of it
 * (an indented block, a positioned line). A continuation line would start at
 * the paragraph's left edge, and a short line has no continuation.
 */
function endedShort(previous: Line, current: Line, frame: BodyFrame): boolean {
  const width = frame.textRight - frame.left;
  if (previous.right >= frame.textRight - SHORT_LINE * width) return false;
  const size = Math.max(previous.sizePt, current.sizePt);
  return current.x <= previous.x + 0.5 * size || current.x > previous.x + 1.5 * size;
}

/** One line starts far to the right of the other: positioned or indented, never a flow. */
function deeplyShifted({ previous, current }: Neighbours): boolean {
  return Math.abs(previous.x - current.x) > DEEP_INDENT;
}

function breaksBefore(
  lines: Neighbours,
  after: Line | undefined,
  leading: number,
  frame: BodyFrame
): boolean {
  const { previous, current } = lines;
  // A tagged PDF says where its paragraphs are; the geometry is only asked when it does not.
  if (previous.blockId !== null && current.blockId !== null) {
    return previous.blockId !== current.blockId;
  }
  return looksSeparate(lines, leading) || setApart(lines, after, frame);
}

/** The lines cannot be one paragraph: a blank line between, a size change, a column. */
function looksSeparate({ previous, current }: Neighbours, leading: number): boolean {
  const gap = previous.baseline - current.baseline;
  const step = Math.max(leading, 1.1 * previous.sizePt);
  if (gap < 0 || gap > BLANK_LINE * step) return true;
  if (Math.abs(current.sizePt - previous.sizePt) > 1) return true;
  return isTabular(previous) || isTabular(current);
}

/** The typesetter's signals that a new paragraph begins with `current`. */
function setApart(lines: Neighbours, after: Line | undefined, frame: BodyFrame): boolean {
  const { previous, current } = lines;
  // A centred line above a flush one is a heading — unless they share a left
  // edge, when the "centred" line is the first line of an indented block.
  const shifted = Math.abs(previous.x - current.x) > 0.5 * current.sizePt;
  if (shifted && isCentered(previous, frame) !== isCentered(current, frame)) return true;
  if (startsBlock(current) || deeplyShifted(lines) || changesFace(lines)) return true;
  if (irregularGapAbove(lines, after)) return true;
  return startsIndented(lines) || endedShort(previous, current, frame);
}

function splitParagraphs(lines: readonly Line[], leading: number, frame: BodyFrame): Line[][] {
  const groups: Line[][] = [];
  lines.forEach((current, index) => {
    const previous = lines[index - 1];
    const group = groups.at(-1);
    if (previous === undefined || group === undefined) {
      groups.push([current]);
      return;
    }
    const neighbours = { previous, current, next: lines[index + 1] };
    if (breaksBefore(neighbours, lines[index + 2], leading, frame)) {
      groups.push([current]);
    } else group.push(current);
  });
  return groups;
}

/**
 * Full lines that end at one right edge, flush left, save the last. Judged on
 * the paragraph's own lines: the page's widest text may be a caption cell
 * that sits past the margin, and the body must not be measured against it.
 */
function isJustified(lines: readonly Line[], tolerance: number): boolean {
  const first = lines[0];
  if (first === undefined || lines.length < 3) return false;
  const body = lines.slice(0, -1);
  const widest = Math.max(...body.map((line) => line.right));
  return (
    body.every((line) => Math.abs(line.right - widest) <= tolerance) &&
    body.every((line) => Math.abs(line.x - first.x) <= tolerance)
  );
}

export function alignmentOf(lines: readonly Line[], frame: BodyFrame): Alignment {
  const first = lines[0];
  if (first === undefined) return 'left';
  const tolerance = Math.max(2, EDGE * first.sizePt);
  if (lines.every((line) => isCentered(line, frame))) return 'center';
  const lefts = lines.map((line) => line.x);
  const spread = Math.max(...lefts) - Math.min(...lefts);
  const rightFlush = lines.every((line) => Math.abs(line.right - frame.textRight) <= tolerance);
  const indentedAlone = lines.length === 1 && first.x - frame.left > 2 * first.sizePt;
  if (rightFlush && (spread > tolerance || indentedAlone)) return 'right';
  return isJustified(lines, tolerance) ? 'justify' : 'left';
}

interface Indents {
  left: number;
  right: number;
  first: number;
}

/** Roughly how wide a line's first word is, from the run that holds it. */
function firstWordWidth(line: Line): number {
  const run = line.cells[0]?.runs[0];
  if (run === undefined || run.text.length === 0) return 0;
  const word = run.text.trimStart().split(/\s/)[0] ?? '';
  return (run.text.length === 0 ? 0 : word.length / run.text.length) * lineRunWidth(line);
}

/** The first run's advance, from the line's geometry (runs carry no width of their own). */
function lineRunWidth(line: Line): number {
  const cell = line.cells[0];
  if (cell === undefined) return 0;
  const chars = cell.runs.reduce((sum, run) => sum + run.text.length, 0);
  const firstChars = cell.runs[0]?.text.length ?? 0;
  const cellRight = line.cells[1]?.x ?? line.right;
  return chars === 0 ? 0 : ((cellRight - cell.x) * firstChars) / chars;
}

/**
 * The widest the paragraph may be before Word could pull a line's first word
 * up onto the line above it: just short of the tightest such fit.
 */
function wrapCeiling(lines: readonly Line[]): number {
  let ceiling = Number.POSITIVE_INFINITY;
  lines.slice(1).forEach((line, index) => {
    const above = lines[index];
    if (above === undefined) return;
    const space = 0.25 * line.sizePt;
    ceiling = Math.min(ceiling, above.right + space + firstWordWidth(line));
  });
  return ceiling;
}

function indentsOf(lines: readonly Line[], frame: BodyFrame, alignment: Alignment): Indents {
  const first = lines[0];
  if (first === undefined || alignment === 'center') return { left: 0, right: 0, first: 0 };
  const rest = lines.slice(1);
  const paragraphLeft = rest.length === 0 ? first.x : Math.min(...rest.map((line) => line.x));
  const widest = Math.max(...lines.map((line) => line.right));
  const firstLine = first.x - paragraphLeft;
  // The paragraph is as wide as its widest line plus a hair for Word's metrics,
  // but never wide enough for a word that began a line in the PDF to fit on
  // the line above it in Word — that would move every break after it.
  const slack = Math.max(WRAP_SLACK, 0.004 * (widest - paragraphLeft));
  const blockRight = Math.max(widest, Math.min(widest + slack, wrapCeiling(lines) - 0.5));
  // Negative when the line reaches past the margin (a running head at the paper's
  // edge, a caption cell): Word lets a paragraph hang into the margin, and the
  // alternative is a word per line.
  return {
    left: alignment === 'right' ? 0 : Math.max(0, paragraphLeft - frame.left),
    right: frame.right - blockRight,
    first: Math.abs(firstLine) < 2 ? 0 : firstLine,
  };
}

function describe(group: Line[], leading: number, options: ParagraphOptions): TextParagraph {
  // Cells set with tab stops are placed by their first cell's indent, never by their outer edges.
  const alignment = group.some(isTabular) ? 'left' : alignmentOf(group, options.frame);
  const indents = indentsOf(group, options.frame, alignment);
  const own = group.length >= 2 ? medianLeading(group) : (options.leadingPt ?? leading);
  return {
    kind: 'text',
    lines: group,
    alignment,
    leadingPt: own,
    indentLeftPt: indents.left,
    indentRightPt: indents.right,
    firstLinePt: indents.first,
    spaceBeforePt: 0,
    tabStops: group.some(isTabular) ? tabStopsOf(group, options.frame) : [],
    top: group[0]?.baseline ?? 0,
  };
}

/**
 * The lines, already in reading order (linesOf), as paragraphs. `spaceBeforePt`
 * is settled later against the page.
 */
export function paragraphsOf(lines: readonly Line[], options: ParagraphOptions): TextParagraph[] {
  const leading = options.leadingPt ?? medianLeading(lines);
  const groups =
    options.linePerParagraph === true
      ? lines.map((line) => [line])
      : splitParagraphs(lines, leading, options.frame);
  return groups.map((group) => describe(group, leading, options));
}

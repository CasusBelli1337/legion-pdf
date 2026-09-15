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
/**
 * Room past the text block's right edge before a left-aligned paragraph wraps.
 * Word's Times New Roman is a hair wider than the PDF's Times here and there;
 * without this a line that filled the block exactly wraps its last word.
 */
const WRAP_SLACK = 6;

export interface ParagraphOptions {
  frame: BodyFrame;
  /** Force every paragraph onto this pitch (pleading paper). */
  leadingPt?: number;
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

/** Equal room either side, and some room — a heading, a caption, a signature line. */
export function isCentered(line: Line, frame: BodyFrame): boolean {
  const leftGap = line.x - frame.left;
  const rightGap = frame.right - line.right;
  const tolerance = Math.max(2, 0.04 * (frame.right - frame.left));
  const room = 2 * line.sizePt;
  return leftGap > room && rightGap > room && Math.abs(leftGap - rightGap) <= tolerance;
}

interface Neighbours {
  previous: Line;
  current: Line;
  next: Line | undefined;
}

/** An indented line that the NEXT line does not follow at the same x is a first line. */
function startsIndented({ previous, current, next }: Neighbours): boolean {
  const size = Math.max(previous.sizePt, current.sizePt);
  if (current.x <= previous.x + 1.5 * size) return false;
  return next === undefined || next.x < current.x - 1.5 * size;
}

function endedShort(previous: Line, current: Line, frame: BodyFrame): boolean {
  const width = frame.textRight - frame.left;
  return previous.right < frame.textRight - SHORT_LINE * width && current.x <= previous.x + 1;
}

function breaksBefore(lines: Neighbours, leading: number, frame: BodyFrame): boolean {
  const { previous, current } = lines;
  const gap = previous.baseline - current.baseline;
  const step = Math.max(leading, 1.1 * previous.sizePt);
  if (gap < 0 || gap > BLANK_LINE * step) return true;
  if (Math.abs(current.sizePt - previous.sizePt) > 1) return true;
  if (isTabular(previous) || isTabular(current)) return true;
  if (isCentered(previous, frame) !== isCentered(current, frame)) return true;
  if (startsBlock(current)) return true;
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
    if (breaksBefore({ previous, current, next: lines[index + 1] }, leading, frame)) {
      groups.push([current]);
    } else group.push(current);
  });
  return groups;
}

/** Full lines that reach the text block's right edge, flush left, save the last. */
function isJustified(lines: readonly Line[], frame: BodyFrame, tolerance: number): boolean {
  const first = lines[0];
  if (first === undefined || lines.length < 2) return false;
  const body = lines.slice(0, -1);
  const widest = Math.max(...body.map((line) => line.right));
  // Justified text reaches the text block's right edge; ragged lines that
  // happen to match each other do not.
  if (widest < frame.textRight - tolerance) return false;
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
  return isJustified(lines, frame, tolerance) ? 'justify' : 'left';
}

interface Indents {
  left: number;
  right: number;
  first: number;
}

function indentsOf(lines: readonly Line[], frame: BodyFrame, alignment: Alignment): Indents {
  const first = lines[0];
  if (first === undefined || alignment === 'center') return { left: 0, right: 0, first: 0 };
  const rest = lines.slice(1);
  const paragraphLeft = rest.length === 0 ? first.x : Math.min(...rest.map((line) => line.x));
  const widest = Math.max(...lines.map((line) => line.right));
  const firstLine = first.x - paragraphLeft;
  // A left-aligned paragraph wraps where the document's text block ends, not
  // at Word's margin: that is what keeps a transcript's lines the length they were.
  const blockRight = alignment === 'left' ? frame.textRight + WRAP_SLACK : widest;
  return {
    left: alignment === 'right' ? 0 : Math.max(0, paragraphLeft - frame.left),
    right: Math.max(0, frame.right - blockRight),
    first: Math.abs(firstLine) < 2 ? 0 : firstLine,
  };
}

function describe(group: Line[], leading: number, options: ParagraphOptions): TextParagraph {
  const alignment = alignmentOf(group, options.frame);
  const indents = indentsOf(group, options.frame, alignment);
  const own = options.leadingPt ?? (group.length >= 2 ? medianLeading(group) : leading);
  return {
    kind: 'text',
    lines: group,
    alignment,
    leadingPt: own,
    indentLeftPt: indents.left,
    indentRightPt: indents.right,
    firstLinePt: indents.first,
    spaceBeforePt: 0,
    tabStopsPt: group.some(isTabular) ? tabStopsOf(group, options.frame) : [],
    top: group[0]?.baseline ?? 0,
  };
}

/**
 * The lines, already in reading order (linesOf), as paragraphs. `spaceBeforePt`
 * is settled later against the page.
 */
export function paragraphsOf(lines: readonly Line[], options: ParagraphOptions): TextParagraph[] {
  const leading = options.leadingPt ?? medianLeading(lines);
  return splitParagraphs(lines, leading, options.frame).map((group) =>
    describe(group, leading, options)
  );
}

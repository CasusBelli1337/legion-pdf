/**
 * Laying a paragraph out again after its words have changed: where each line
 * breaks, where it starts, and how a justified line spreads its words. Pure
 * arithmetic over a width function, so it is tested without a font.
 *
 * Wrapping is greedy — the same rule Word and every PDF writer use for plain
 * paragraphs — and a word wider than the whole measure is set on its own line
 * and allowed to overhang rather than being cut.
 */

import type { TextAlignment } from '@shared/types';

export interface LayoutSpec {
  /** Left edge of the paragraph's body lines, along the baseline. */
  left: number;
  /** Right edge every line must stay inside. */
  right: number;
  /** How far the first line starts in from `left`; negative for a hanging indent. */
  firstIndent: number;
  alignment: TextAlignment;
  /** Baseline-to-baseline distance. */
  leading: number;
}

export interface LaidWord {
  text: string;
  width: number;
}

export interface LaidLine {
  words: LaidWord[];
  /** Where the line starts along the baseline. */
  start: number;
  /** Extra space added between each pair of words (justified lines only). */
  extraPerGap: number;
  /** Line number from the top, starting at 0. */
  row: number;
}

export type Measure = (text: string) => number;

function wordsOf(paragraph: string): string[] {
  return paragraph.split(/[ \t]+/).filter((word) => word.length > 0);
}

/** Greedy wrap of one hard-broken paragraph into rows of words. */
function wrap(
  words: readonly string[],
  measure: Measure,
  spaceWidth: number,
  widthOf: (row: number) => number,
  firstRow: number
): LaidWord[][] {
  const rows: LaidWord[][] = [];
  let current: LaidWord[] = [];
  let used = 0;
  for (const text of words) {
    const width = measure(text);
    const available = widthOf(firstRow + rows.length);
    if (current.length > 0 && used + spaceWidth + width > available) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push({ text, width });
    used += (current.length === 1 ? 0 : spaceWidth) + width;
  }
  if (current.length > 0 || words.length === 0) rows.push(current);
  return rows;
}

function naturalWidth(words: readonly LaidWord[], spaceWidth: number): number {
  return (
    words.reduce((total, word) => total + word.width, 0) +
    Math.max(0, words.length - 1) * spaceWidth
  );
}

function placeRow(
  words: LaidWord[],
  row: number,
  isLast: boolean,
  spec: LayoutSpec,
  spaceWidth: number
): LaidLine {
  const indent = row === 0 ? spec.firstIndent : 0;
  const left = spec.left + Math.max(0, indent);
  const measure = spec.right - left;
  const width = naturalWidth(words, spaceWidth);
  const slack = Math.max(0, measure - width);
  if (spec.alignment === 'right') return { words, start: spec.right - width, extraPerGap: 0, row };
  if (spec.alignment === 'center') return { words, start: left + slack / 2, extraPerGap: 0, row };
  if (spec.alignment === 'justify' && !isLast && words.length > 1) {
    return { words, start: left, extraPerGap: slack / (words.length - 1), row };
  }
  return { words, start: left, extraPerGap: 0, row };
}

/**
 * Every line of the new paragraph. Hard breaks (`\n`) end a line and start a
 * fresh one; each hard-broken piece wraps on its own, and its last line is
 * never justified.
 */
export function layoutParagraph(text: string, spec: LayoutSpec, measure: Measure): LaidLine[] {
  const spaceWidth = measure(' ');
  const widthOf = (row: number): number =>
    spec.right - spec.left - (row === 0 ? Math.max(0, spec.firstIndent) : 0);
  const lines: LaidLine[] = [];
  for (const piece of text.replace(/\r\n?/g, '\n').split('\n')) {
    const rows = wrap(wordsOf(piece), measure, spaceWidth, widthOf, lines.length);
    rows.forEach((words, index) => {
      lines.push(placeRow(words, lines.length, index === rows.length - 1, spec, spaceWidth));
    });
  }
  return lines;
}

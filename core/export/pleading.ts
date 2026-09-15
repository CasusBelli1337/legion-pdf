/**
 * Pleading paper: the numbered column down the left margin that every
 * California filing carries, with the rule (often double) beside it and a rule
 * down the right edge. The numbers are not body text — copying them into the
 * Word file as words would put "1", "2", "3" in the attorney's paragraphs.
 *
 * Word's own line numbering is NOT how a pleading template does it: it numbers
 * only lines that hold a paragraph, so a page with eight lines of text shows
 * 1–8 and nothing below. Arthur's templates (and Legion's builders) put the
 * numbers in a header-anchored table on an exact pitch, with the body on the
 * same pitch from a fixed top margin, so line 14 of the body is beside number
 * 14 whatever the page holds. That is what the export reproduces, and this
 * module reads everything it needs: the pitch, where line 1 sits, how many
 * lines a page has, the numbers' face and size, and which rules were drawn.
 */

import type { LayoutRule, PageLayout } from '@shared/types';
import { median } from './paragraphs';

/** Fewer numbers than this in one column is a list, not pleading paper. */
const MIN_NUMBERS = 10;
/** Line numbers never exceed this; a larger integer in the margin is something else. */
const MAX_LINE_NUMBER = 32;
/** Numbers within this many points of x sit in one column. */
const COLUMN_TOLERANCE = 6;
/** A rule is vertical when it is at most this wide and at least this share of the page tall. */
const RULE_MAX_WIDTH = 3;
const RULE_MIN_HEIGHT_SHARE = 0.4;
/** Two rules this close together are one double rule. */
const DOUBLE_GAP = 4;
/** How far right of the numbers the rule beside them may sit. */
const INNER_RULE_REACH = 30;
/** The right-hand rule lives in the right quarter of the page. */
const RIGHT_RULE_SHARE = 0.72;
/** Body runs left of the numbers that make the numbers a list inside the body, not a margin. */
const MAX_STRAYS = 3;
/** More than this share of the numbers off the fitted grid says they follow the text. */
const OFF_GRID_SHARE = 0.2;
/** A number this far (× pitch) from the median estimate is a misread the fit leaves out. */
const OUTLIER_SHARE = 0.5;
/** A number this far (× pitch) off the fitted grid says the numbers follow the text, not a grid. */
const GRID_TOLERANCE = 0.25;

export type RuleStyle = 'none' | 'single' | 'double';

export interface PleadingRules {
  /** The rule between the numbers and the body, and its x (the centre of a double rule). */
  inner: RuleStyle;
  innerX: number | null;
  right: RuleStyle;
  rightX: number | null;
}

export interface Pleading {
  /**
   * True when the numbers sit on a fixed grid (a pleading template's header
   * column), false when they follow the text lines — Word's own line
   * numbering, which numbers a single-spaced address block 12 pt apart and a
   * double-spaced body 24 pt apart. A grid is rebuilt as a header table; the
   * other kind is handed back to Word's numbering, which is what made it.
   */
  grid: boolean;
  /** Baseline-to-baseline distance of the numbered lines, points. */
  pitchPt: number;
  /** Lines per page: the largest number printed. */
  count: number;
  /** Baseline of line 1, fitted through every number on the page (PDF y). */
  firstBaseline: number;
  /** Baseline of line `count`. */
  lastBaseline: number;
  numberLeft: number;
  /** Right edge of the number column — what the body's left margin is measured from. */
  numberRight: number;
  /** The numbers' own face and size. */
  fontKey: string;
  sizePt: number;
  rules: PleadingRules;
}

interface Numbered {
  value: number;
  x: number;
  right: number;
  y: number;
  fontKey: string;
  sizePt: number;
}

function numbersOf(layout: PageLayout): Numbered[] {
  return layout.runs.flatMap((run) => {
    if (run.role !== 'line-number' || !/^\d{1,2}$/.test(run.text.trim())) return [];
    const value = Number(run.text.trim());
    if (value < 1) return [];
    return [
      {
        value,
        x: run.x,
        right: run.x + run.width,
        y: run.y,
        fontKey: run.fontKey,
        sizePt: run.sizePt,
      },
    ];
  });
}

/**
 * The grid through every number: a least-squares line of baseline against
 * line number. A producer that rounds each baseline to a twip leaves every
 * gap a hair off; over twenty-eight lines the median gap drifts a point and a
 * half from the true pitch, while the fitted line lands on it.
 */
function gridOf(column: readonly Numbered[]): { pitchPt: number; firstBaseline: number } {
  const count = column.length;
  const meanValue = column.reduce((sum, entry) => sum + entry.value, 0) / count;
  const meanY = column.reduce((sum, entry) => sum + entry.y, 0) / count;
  let covariance = 0;
  let variance = 0;
  for (const entry of column) {
    covariance += (entry.value - meanValue) * (entry.y - meanY);
    variance += (entry.value - meanValue) ** 2;
  }
  const pitchPt = variance === 0 ? 0 : -covariance / variance;
  return { pitchPt, firstBaseline: meanY + pitchPt * (meanValue - 1) };
}

/**
 * A first estimate no single number can drag: the median of every pair's
 * slope, and the median of where each number puts line 1. An OCR's "11" read
 * as "1" sits ten lines from where a "1" belongs; a least-squares line would
 * lean towards it, the medians do not.
 */
function medianGridOf(column: readonly Numbered[]): { pitchPt: number; firstBaseline: number } {
  const slopes: number[] = [];
  column.forEach((a, index) => {
    for (const b of column.slice(index + 1)) {
      if (a.value !== b.value) slopes.push((a.y - b.y) / (b.value - a.value));
    }
  });
  const pitchPt = median(slopes);
  return { pitchPt, firstBaseline: median(column.map((e) => e.y + (e.value - 1) * pitchPt)) };
}

/**
 * The grid: numbers far off the median estimate are left out (misreads), and
 * the rest are fitted by least squares for the precision a producer's
 * twip-rounded baselines need.
 */
function robustGridOf(column: readonly Numbered[]): { pitchPt: number; firstBaseline: number } {
  const rough = medianGridOf(column);
  if (!(rough.pitchPt > 0)) return rough;
  const kept = column.filter(
    (entry) =>
      Math.abs(rough.firstBaseline - (entry.value - 1) * rough.pitchPt - entry.y) <=
      OUTLIER_SHARE * rough.pitchPt
  );
  return kept.length >= MIN_NUMBERS ? gridOf(kept) : rough;
}

/** The usual gap between neighbouring numbers, and the topmost number's baseline. */
function followedGrid(column: readonly Numbered[]): { pitchPt: number; firstBaseline: number } {
  const sorted = [...column].sort((a, b) => a.value - b.value);
  const gaps = sorted
    .slice(1)
    .map((entry, index) => (sorted[index]?.y ?? 0) - entry.y)
    .filter((gap) => gap > 0);
  return { pitchPt: median(gaps), firstBaseline: Math.max(...column.map((entry) => entry.y)) };
}

function rulesOf(layout: PageLayout, numberRight: number): PleadingRules {
  const vertical = layout.rules
    .filter(
      (rule: LayoutRule) =>
        rule.rect.width <= RULE_MAX_WIDTH &&
        rule.rect.height >= RULE_MIN_HEIGHT_SHARE * layout.size.height
    )
    .map((rule) => rule.rect.x + rule.rect.width / 2)
    .sort((a, b) => a - b);
  const inner = styleOf(
    vertical.filter((x) => x >= numberRight - 1 && x <= numberRight + INNER_RULE_REACH)
  );
  const right = styleOf(vertical.filter((x) => x >= RIGHT_RULE_SHARE * layout.size.width));
  return { inner: inner.style, innerX: inner.x, right: right.style, rightX: right.x };
}

/** One rule, or two within DOUBLE_GAP as a double rule at their centre. */
function styleOf(xs: readonly number[]): { style: RuleStyle; x: number | null } {
  const first = xs[0];
  const second = xs[1];
  if (first === undefined) return { style: 'none', x: null };
  const isDouble = second !== undefined && second - first <= DOUBLE_GAP;
  return {
    style: isDouble ? 'double' : 'single',
    x: isDouble ? (first + (second ?? first)) / 2 : first,
  };
}

/** The layout's pleading column, or null when the page is not pleading paper. */
export function pleadingOf(layout: PageLayout): Pleading | null {
  const numbers = numbersOf(layout);
  if (numbers.length < MIN_NUMBERS) return null;
  const leftmost = Math.min(...numbers.map((entry) => entry.x));
  const column = numbers.filter((entry) => entry.x - leftmost <= COLUMN_TOLERANCE + 8);
  if (column.length < MIN_NUMBERS) return null;
  const values = column.map((entry) => entry.value);
  // A value that repeats is a stack of mini-pages (a condensed transcript), not one page's column.
  if (new Set(values).size !== values.length || Math.max(...values) > MAX_LINE_NUMBER) return null;
  const numberRight = Math.max(...column.map((entry) => entry.right));
  // A numbered list sits inside the body; pleading numbers sit left of all of
  // it. A couple of strays are an OCR's misread numbers, not body text.
  // Two-character scraps left of the numbers are an OCR's misread digits;
  // a run of text there is body text, and the numbers are a list inside it.
  const strays = layout.runs.filter(
    (run) => run.role === 'body' && run.text.trim().length >= 4 && run.x < numberRight - 2
  );
  if (strays.length >= MAX_STRAYS) return null;
  const fitted = robustGridOf(column);
  if (!(fitted.pitchPt > 0)) return null;
  const count = Math.max(...column.map((entry) => entry.value));
  const sample = column[0] as Numbered;
  // A few numbers off the fitted line are an OCR's misreads ("12" read as "2");
  // more than a fifth of them means the numbers follow the text, not a grid.
  const off = column.filter(
    (entry) =>
      Math.abs(fitted.firstBaseline - (entry.value - 1) * fitted.pitchPt - entry.y) >
      GRID_TOLERANCE * fitted.pitchPt
  ).length;
  const offGrid = off > OFF_GRID_SHARE * column.length;
  // Numbers that follow the text have no grid to fit: their pitch is the usual
  // gap between neighbours and "line 1" is simply the topmost number.
  const { pitchPt, firstBaseline } = offGrid ? followedGrid(column) : fitted;
  return {
    grid: !offGrid,
    pitchPt,
    count,
    firstBaseline,
    lastBaseline: firstBaseline - (count - 1) * pitchPt,
    numberLeft: leftmost,
    numberRight,
    fontKey: sample.fontKey,
    sizePt: median(column.map((entry) => entry.sizePt)),
    rules: rulesOf(layout, numberRight),
  };
}

function majority<T extends string>(values: readonly T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

/**
 * One pleading geometry for a run of pages: the median of what each page
 * says, so a scanned page whose OCR dropped number 28 still gets 28 lines.
 */
export function pleadingOfSection(pages: readonly PageLayout[]): Pleading | null {
  const found = pages.map(pleadingOf).filter((entry): entry is Pleading => entry !== null);
  const first = found[0];
  if (first === undefined) return null;
  const pitchPt = median(found.map((entry) => entry.pitchPt));
  const firstBaseline = median(found.map((entry) => entry.firstBaseline));
  const count = Math.max(...found.map((entry) => entry.count));
  const innerXs = found.flatMap((entry) =>
    entry.rules.innerX === null ? [] : [entry.rules.innerX]
  );
  const rightXs = found.flatMap((entry) =>
    entry.rules.rightX === null ? [] : [entry.rules.rightX]
  );
  return {
    // One scanned page whose OCR dropped half its numbers must not turn the
    // whole section over to Word's numbering: the pages vote.
    grid:
      majority(
        found.map((entry) => (entry.grid ? 'grid' : 'follow')),
        'grid'
      ) === 'grid',
    pitchPt,
    count,
    firstBaseline,
    lastBaseline: firstBaseline - (count - 1) * pitchPt,
    numberLeft: median(found.map((entry) => entry.numberLeft)),
    numberRight: median(found.map((entry) => entry.numberRight)),
    fontKey: first.fontKey,
    sizePt: median(found.map((entry) => entry.sizePt)),
    rules: {
      inner: majority(
        found.map((entry) => entry.rules.inner),
        'none'
      ),
      innerX: innerXs.length === 0 ? null : median(innerXs),
      right: majority(
        found.map((entry) => entry.rules.right),
        'none'
      ),
      rightX: rightXs.length === 0 ? null : median(rightXs),
    },
  };
}

export const LINE_NUMBERS_NOTE =
  'Line numbers printed beside the text were left out; they were not a pleading-paper column Word could reproduce.';

export const NUMBERED_LINES_NOTE =
  'Line numbers follow the lines of text (Word’s own line numbering made them), so Word numbers the lines again the same way.';

export const PLEADING_NOTE =
  'Pleading paper: the line numbers and rules are rebuilt in the page header the way a pleading template draws them, so every page shows all of its numbers and line 14 stays line 14.';

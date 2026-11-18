/**
 * A scan's recognised text, made ready to be set as type.
 *
 * Some OCR layers give every word the height of its own ink as its size: "of"
 * is 10.8 pt, "and" 8.7, "its" 8.6 on one line of a pleading typed at 10.5.
 * Set that way in Word the page looks ransom-noted, lines of mixed sizes
 * overlap the single-spaced ones above them, and the line numbers shrink to
 * the height of a digit. The words' WIDTHS are sound, though: measured against
 * Times they agree on the type size to a few per cent across a whole filing.
 * So when a document's recognised sizes disagree, every recognised word and
 * line number takes the size its widths say the page was typed in; a word set
 * plainly larger (a title) keeps a size of its own.
 *
 * Some of those layers also give each word the BOTTOM of its ink as its
 * baseline, so "principal" sits a descender lower than "business" beside it,
 * and a line of "limited liability company;" lands two points nearer the
 * capitals under it than it was typed — in single-spaced blocks, on top of
 * them. Where the words themselves show it (descender words sitting lower
 * than their neighbours, page after page), a word with a descender, a comma
 * or a bracket is lifted back by that much; a layer that already carries
 * true baselines is left where it is.
 *
 * The scan's own line numbers are also read, and misread: "11" as "ll", "16"
 * as "l6", "1" as "l". The classifier only claims the ones that read as
 * numbers; the rest landed in the body, over the rebuilt numbers and at the
 * head of their lines. Recognised text that begins inside the numbered column
 * is dropped: no word of the body starts there.
 *
 * And a caption held apart by a column of ")" is read as loose parentheses:
 * one a word space from the party's name joined its line, and the title a
 * space after one followed it leftwards. Parentheses stacked at one x down
 * the page are a column: each is marked a cell of its own.
 */

import type { LayoutFont, LayoutTextRun, PageLayout } from '@shared/types';
import { median } from './paragraphs';
import type { Pleading } from './pleading';
import { timesWidth } from './recognized-fit';

/** A word this long says something about the size it was typed in. */
const MIN_LETTERS = 5;
/** Too few words to judge a document by. */
const MIN_WORDS = 20;
/** Sizes whose ninth decile is this much over their first are box heights, not type sizes. */
const ERRATIC_SPREAD = 1.12;
/** Sizes this far under what the words' widths say are ink heights too. */
const UNDERSIZED = 0.93;
/** A word this much wider than the body's type was typed larger. */
const LARGER = 1.2;
/** How far below the baseline the ink of each kind of character reaches, × the type size (Times). */
const DESCENTS: readonly { test: RegExp; share: number }[] = [
  { test: /[gjpqy]/, share: 0.22 },
  { test: /[()[\]{}|/$@_]/, share: 0.18 },
  { test: /[,;]/, share: 0.13 },
];
/** How far past the numbers' right edge a stray may reach and still be one of them, points. */
const COLUMN_SLACK = 2;

/**
 * The face the rebuilt line numbers are set in on a page whose recognised
 * sizes were ink heights: the body's (recognised text is set in Times New
 * Roman), not the OCR layer's own, which is whatever the recogniser embeds.
 */
export const RECOGNIZED_NUMBER_FONT_KEY = 'legion-recognized-number';
const RECOGNIZED_NUMBER_FONT: LayoutFont = {
  name: 'TimesNewRomanPSMT',
  family: 'serif',
  bold: false,
  italic: false,
};

function isRecognizedWord(run: LayoutTextRun): boolean {
  return run.hidden === true && run.role === 'body' && run.text.trim().length >= MIN_LETTERS;
}

/** The type size at which Times sets the run's text as wide as the scan had it. */
function widthSize(run: LayoutTextRun): number {
  return run.width / timesWidth(run.text, 1);
}

function decile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

const toHalfPoint = (size: number): number => Math.round(size * 2) / 2;

/**
 * The size the document's recognised body was typed in, to the half point —
 * or null when the layer carries real type sizes or there is too little
 * recognised text to tell. Sizes are taken for ink heights when they disagree
 * with each other, or when they agree but run small against the words' own
 * widths (a layer that sizes each LINE by its ink is steady, and a tenth
 * under: ink stands shorter than the type it was set in, never taller).
 */
export function recognizedBodySize(pages: readonly PageLayout[]): number | null {
  const words = pages.flatMap((page) => page.runs.filter(isRecognizedWord));
  if (words.length < MIN_WORDS) return null;
  const sizes = words.map((run) => run.sizePt);
  const typed = median(words.map(widthSize));
  const erratic = decile(sizes, 0.9) > ERRATIC_SPREAD * decile(sizes, 0.1);
  const undersized = median(sizes) < UNDERSIZED * typed;
  return erratic || undersized ? toHalfPoint(typed) : null;
}

/** How far under its baseline the word's ink reaches, × the type size. */
function descentShare(text: string): number {
  return DESCENTS.find((entry) => entry.test.test(text))?.share ?? 0;
}

/** A foot item this long says its own size by its width. */
const MIN_FOOT_LETTERS = 8;

/** What the document's recognised text says about how it was typed. */
interface Typing {
  /** The size the body was typed in. */
  bodySize: number;
  /** How far the layer's sizes run under the type's: the body's typed size over its recognised one. */
  scale: number;
  /** The layer's baselines are the bottoms of the words' ink. */
  inkBaselines: boolean;
}

/**
 * A foot is set in sizes of its own — a document number in six point, the
 * title in nine — so each word long enough takes the size its width says. A
 * page number and the dashes round it are too short to measure: they take the
 * layer's size for them, raised by as much as the layer under-reports the
 * body, and never more than the body's own.
 */
function footSize(run: LayoutTextRun, typing: Typing): number {
  const long = run.role === 'page-number' ? MIN_FOOT_LETTERS : MIN_LETTERS;
  if (run.text.trim().length >= long) return toHalfPoint(widthSize(run));
  return Math.min(typing.bodySize, toHalfPoint(run.sizePt * typing.scale));
}

/** One recognised word as type: the size it was typed in, on the baseline it was typed on. */
function asTyped(run: LayoutTextRun, typing: Typing): LayoutTextRun {
  const { bodySize } = typing;
  if (run.hidden !== true) return run;
  if (run.role === 'line-number') {
    return { ...run, sizePt: bodySize, fontKey: RECOGNIZED_NUMBER_FONT_KEY };
  }
  if (run.role === 'footer' || run.role === 'page-number') {
    return { ...run, sizePt: footSize(run, typing) };
  }
  if (run.role !== 'body') return run;
  const own = run.text.trim().length >= MIN_LETTERS ? widthSize(run) : bodySize;
  const sizePt = own > LARGER * bodySize ? toHalfPoint(own) : bodySize;
  const lift = typing.inkBaselines ? descentShare(run.text) * sizePt : 0;
  return { ...run, sizePt, y: run.y + lift };
}

/** Too few neighbouring pairs to say how a layer sets its baselines. */
const MIN_PAIRS = 12;
/** Descender words this far (× size) under their neighbours sit on their ink, not their baseline. */
const INK_DROP = 0.1;

const hasDescender = (run: LayoutTextRun): boolean => /[gjpqy]/.test(run.text);
const sitsOnBaseline = (run: LayoutTextRun): boolean => descentShare(run.text) === 0;

/**
 * True when the layer's baselines are the bottoms of the words' ink: its
 * words with descenders sit lower than the plain words next to them on the
 * line, by a descender. A layer with true baselines shows no such drop.
 */
export function hasInkBaselines(pages: readonly PageLayout[], bodySize: number): boolean {
  const drops: number[] = [];
  for (const page of pages) {
    // Words only: some layers hand the spaces between them over as runs of their own.
    const words = page.runs.filter(
      (run) => run.hidden === true && run.role === 'body' && run.text.trim().length > 0
    );
    words.forEach((word, index) => {
      const beside = words[index + 1];
      if (beside === undefined || Math.abs(beside.y - word.y) > 0.5 * bodySize) return;
      if (hasDescender(word) && sitsOnBaseline(beside)) drops.push(beside.y - word.y);
      if (hasDescender(beside) && sitsOnBaseline(word)) drops.push(word.y - beside.y);
    });
  }
  return drops.length >= MIN_PAIRS && median(drops) >= INK_DROP * bodySize;
}

/** What a caption's parenthesis reads as. */
const PAREN = /^[)\]}]$/;
/** Parentheses within this many points of one x are in one column. */
const SAME_COLUMN = 3;
/** Fewer than this many stacked parentheses are not a caption's column. */
const MIN_COLUMN = 6;

function isParen(run: LayoutTextRun): boolean {
  return run.hidden === true && run.role === 'body' && PAREN.test(run.text.trim());
}

/** The page with its caption's column of ")" marked: each a cell of its own. */
function withParenColumn(page: PageLayout): PageLayout {
  const parens = page.runs.filter(isParen);
  if (parens.length < MIN_COLUMN) return page;
  const at = median(parens.map((run) => run.x));
  const column = new Set(parens.filter((run) => Math.abs(run.x - at) <= SAME_COLUMN));
  if (column.size < MIN_COLUMN) return page;
  return {
    ...page,
    runs: page.runs.map((run) => (column.has(run) ? { ...run, ownCell: true } : run)),
  };
}

/** A recognised word back on its baseline; its size as the layer has it. */
function lifted(run: LayoutTextRun): LayoutTextRun {
  if (run.hidden !== true || run.role !== 'body') return run;
  const lift = descentShare(run.text) * run.sizePt;
  return lift === 0 ? run : { ...run, y: run.y + lift };
}

/**
 * The pages with their recognised text made ready: a caption's column of ")"
 * marked; where the layer's sizes are ink heights, every word in the size it
 * was typed; and where its baselines are ink bottoms, every word back on the
 * baseline it was typed on.
 */
export function recognizedPagesOf(pages: readonly PageLayout[]): PageLayout[] {
  const marked = pages.map(withParenColumn);
  const sizes = pages.flatMap((page) =>
    page.runs.filter(isRecognizedWord).map((run) => run.sizePt)
  );
  if (sizes.length === 0) return marked;
  const read = median(sizes);
  const bodySize = recognizedBodySize(pages);
  const inkBaselines = hasInkBaselines(pages, bodySize ?? read);
  if (bodySize === null) {
    if (!inkBaselines) return marked;
    return marked.map((page) => ({ ...page, runs: page.runs.map(lifted) }));
  }
  const typing: Typing = { bodySize, scale: Math.max(1, bodySize / read), inkBaselines };
  return marked.map((page) => ({
    ...page,
    fonts: { ...page.fonts, [RECOGNIZED_NUMBER_FONT_KEY]: RECOGNIZED_NUMBER_FONT },
    runs: page.runs.map((run) => asTyped(run, typing)),
  }));
}

/**
 * A leftover of the numbered column. In typed text only a bare number wholly
 * inside the column; in recognised text anything that BEGINS inside it — no
 * word of the body starts left of the numbers' right edge, whatever a misread
 * number and the rule beside it were taken for ("l6", ".18", "567009").
 */
function isStray(run: LayoutTextRun, edge: number): boolean {
  if (run.hidden === true) return run.x < edge - COLUMN_SLACK;
  return /^\d{1,2}$/.test(run.text.trim()) && run.x + run.width <= edge;
}

/** The runs without the numbered column's leftovers: numbers the classifier did not claim. */
export function withoutStrayNumbers(
  runs: LayoutTextRun[],
  pleading: Pleading | null
): LayoutTextRun[] {
  if (pleading === null) return runs;
  const edge = pleading.numberRight + COLUMN_SLACK;
  return runs.filter((run) => !isStray(run, edge));
}

/** The page without the numbered column's leftovers in its body (what sets the body's left edge). */
export function withoutStrays(page: PageLayout, pleading: Pleading): PageLayout {
  const body = page.runs.filter((run) => run.role === 'body');
  const kept = new Set(withoutStrayNumbers(body, pleading));
  if (kept.size === body.length) return page;
  return { ...page, runs: page.runs.filter((run) => run.role !== 'body' || kept.has(run)) };
}

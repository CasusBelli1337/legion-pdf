/**
 * How wide Word will set the document's text, against how wide the PDF set it.
 *
 * Word lays Times New Roman out on the face's own advance widths. A PDF from
 * an older Word (a firm's long-lived template in compatibility mode, printed
 * through Acrobat's add-in) was laid out on widths rounded for the printer and
 * comes out nearly one per cent narrower: "correspondence" is 74.6 pt on the
 * page and 75.3 pt in Word. A paragraph held to the PDF's width then wraps its
 * last word; one given slack lets the next line's first word climb. Measured
 * here instead, page by page (a proof of service pasted from a form is set
 * tighter than the brief it follows): the advance widths are public (the core Times metrics, which
 * Times New Roman matches glyph for glyph), so the ratio between them and the
 * page's own runs says how much wider every line will be in Word.
 */

import type { LayoutFont, LayoutTextRun, PageLayout } from '@shared/types';

/** Times New Roman regular, thousandths of an em. */
const TIMES: Readonly<Record<string, number>> = {
  ' ': 250,
  '!': 333,
  '"': 408,
  '#': 500,
  $: 500,
  '%': 833,
  '&': 778,
  "'": 180,
  '(': 333,
  ')': 333,
  '*': 500,
  '+': 564,
  ',': 250,
  '-': 333,
  '.': 250,
  '/': 278,
  ':': 278,
  ';': 278,
  '<': 564,
  '=': 564,
  '>': 564,
  '?': 444,
  '@': 921,
  A: 722,
  B: 667,
  C: 667,
  D: 722,
  E: 611,
  F: 556,
  G: 722,
  H: 722,
  I: 333,
  J: 389,
  K: 722,
  L: 611,
  M: 889,
  N: 722,
  O: 722,
  P: 556,
  Q: 722,
  R: 667,
  S: 556,
  T: 611,
  U: 722,
  V: 722,
  W: 944,
  X: 722,
  Y: 722,
  Z: 611,
  '[': 333,
  ']': 333,
  _: 500,
  a: 444,
  b: 500,
  c: 444,
  d: 500,
  e: 444,
  f: 333,
  g: 500,
  h: 500,
  i: 278,
  j: 278,
  k: 500,
  l: 278,
  m: 778,
  n: 500,
  o: 500,
  p: 500,
  q: 500,
  r: 333,
  s: 389,
  t: 278,
  u: 500,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 444,
  '‘': 333,
  '’': 333,
  '“': 444,
  '”': 444,
  '–': 500,
  '—': 1000,
  '§': 500,
  '¶': 453,
};
for (const digit of '0123456789') (TIMES as Record<string, number>)[digit] = 500;

/** The regular face only: bold and italic have their own widths. */
const TIMES_REGULAR = /(^|\+)Times(NewRoman|-Roman)(PS)?(MT)?$/i;
/** A run shorter than this says too little about the face's widths. */
const MIN_CHARS = 12;
/** Fewer runs than this and nothing is concluded. */
const MIN_RUNS = 5;
/** Outside this the "difference" is a different face, or stretched justified text. */
const MIN_SCALE = 0.985;
const MAX_SCALE = 1.02;

/** The run's width on Word's own advances, points; null when a glyph is not in the table. */
function tableWidth(run: LayoutTextRun): number | null {
  let units = 0;
  for (const char of run.text) {
    const width = TIMES[char];
    if (width === undefined) return null;
    units += width;
  }
  return (units * run.sizePt) / 1000;
}

function isTimesRegular(font: LayoutFont | undefined): boolean {
  return font !== undefined && !font.bold && !font.italic && TIMES_REGULAR.test(font.name);
}

/** Word's width over the page's for one run of body text in the regular face, or null. */
function ratioOf(run: LayoutTextRun, layout: PageLayout): number | null {
  if (run.role !== 'body' || run.hidden === true || run.width <= 0) return null;
  if (run.text.trim().length < MIN_CHARS) return null;
  if (!isTimesRegular(layout.fonts[run.fontKey])) return null;
  const width = tableWidth(run);
  return width === null ? null : width / run.width;
}

/**
 * Word's width over the page's width for the page's Times New Roman, or null
 * when the page is not set in it (or too little of it is). The median over
 * runs: a justified line's stretched spaces pull single runs down, never the
 * middle of a ragged-right page; a page that is mostly justified reads as
 * narrower than Word and is taken as equal.
 */
export function pageWidthScale(layout: PageLayout): number | null {
  const ratios = layout.runs
    .map((run) => ratioOf(run, layout))
    .filter((ratio): ratio is number => ratio !== null);
  if (ratios.length < MIN_RUNS) return null;
  ratios.sort((a, b) => a - b);
  const scale = ratios[Math.floor(ratios.length / 2)] ?? 1;
  return scale >= MIN_SCALE && scale <= MAX_SCALE ? Math.max(1, scale) : null;
}

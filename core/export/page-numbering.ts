/**
 * How a filing numbers its pages, read off the feet themselves. A brief
 * numbers its tables i, ii and its argument 1, 2, 3; a cover page prints no
 * number; a scan's "- 2 -" sits higher than any number the viewer looks for.
 * One Word footer cannot count that way — but a section per stretch of
 * numbering can: each states where it starts and how it counts (roman or
 * arabic), and its PAGE field prints what the page printed.
 */

import type { LayoutTextRun, PageLayout } from '@shared/types';
import { overlap } from './recognized-foot';

export type NumberStyle = 'decimal' | 'lowerRoman';

/** The numeral inside a page number's run: digits, or small roman letters. */
const NUMERAL = /\d+|[ivxl]+/;

/** The run's text with its numeral swapped for `field`: the digits where it has any, else the roman letters. */
export function withNumeralAs(text: string, field: string): string {
  return text.replace(/\d/.test(text) ? /\d+/ : /[ivxl]+/, field);
}
/** A foot line that is nothing but a number: "2", "- 2 -", "ii". */
const NUMBER_LINE = /^[\s\-–—]*(\d{1,4}|[ivxl]{1,7})[\s\-–—]*$/;
/** Runs this close in height, points, sit on one line. */
const SAME_LINE = 4;

const ROMAN: readonly (readonly [number, string])[] = [
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function toRoman(value: number): string {
  let rest = value;
  let text = '';
  for (const [worth, letters] of ROMAN) {
    while (rest >= worth) {
      text += letters;
      rest -= worth;
    }
  }
  return text;
}

/** What a small-roman numeral counts to; null when the letters are not one ("ill", "vv"). */
export function romanValue(text: string): number | null {
  for (let value = 1; value <= 89; value += 1) {
    if (toRoman(value) === text) return value;
  }
  return null;
}

function numeralValue(numeral: string): number | null {
  if (/^\d+$/.test(numeral)) {
    const value = Number.parseInt(numeral, 10);
    return value > 0 ? value : null;
  }
  return romanValue(numeral);
}

function numberRuns(page: PageLayout): LayoutTextRun[] {
  return page.runs.filter((run) => run.role === 'page-number' && run.text.trim().length > 0);
}

/** How the page's printed number counts; null when it prints none. */
export function numberStyleOf(page: PageLayout): NumberStyle | null {
  const [run] = numberRuns(page);
  if (run === undefined || page.printedPageNumber === null) return null;
  return /\d/.test(run.text) ? 'decimal' : 'lowerRoman';
}

/** The first style any of the pages counts in. */
export function sectionNumberStyle(pages: readonly PageLayout[]): NumberStyle | undefined {
  for (const page of pages) {
    const style = numberStyleOf(page);
    if (style !== null) return style;
  }
  return undefined;
}

/** Runs further apart than this, points, are separate items on one line: a document number, a page number. */
const ITEM_GAP = 18;

/** One line's runs cut into the items it holds, left to right. */
function itemsOf(line: LayoutTextRun[]): LayoutTextRun[][] {
  const items: LayoutTextRun[][] = [];
  for (const run of [...line].sort((a, b) => a.x - b.x)) {
    const item = items.at(-1);
    const last = item?.at(-1);
    if (item !== undefined && last !== undefined && run.x - (last.x + last.width) <= ITEM_GAP) {
      item.push(run);
    } else items.push([run]);
  }
  return items;
}

/** The foot's items — runs on one line with no wide gap between them — top line first. */
function footItems(page: PageLayout): LayoutTextRun[][] {
  const runs = page.runs
    .filter((run) => run.role === 'footer' && run.text.trim().length > 0)
    .sort((a, b) => b.y - a.y);
  const lines: LayoutTextRun[][] = [];
  for (const run of runs) {
    const line = lines.at(-1);
    const first = line?.[0];
    if (line !== undefined && first !== undefined && first.y - run.y <= SAME_LINE) line.push(run);
    else lines.push([run]);
  }
  return lines.flatMap(itemsOf);
}

/** The one item of the foot that is only a number, when the page has exactly one. */
function loneNumber(page: PageLayout): { item: LayoutTextRun[]; value: number } | null {
  const found = footItems(page).flatMap((item) => {
    const numeral = NUMBER_LINE.exec(item.map((run) => run.text).join(''))?.[1];
    const value = numeral === undefined ? null : numeralValue(numeral);
    return value === null ? [] : [{ item, value }];
  });
  return found.length === 1 ? (found[0] ?? null) : null;
}

/**
 * The item as one run. Recognition hands "- 3 -" over in pieces ("-3", "—"),
 * and a piece that is only a dash would be thrown out as scanner noise.
 */
function asOneRun(item: readonly LayoutTextRun[], footSizePt: number): LayoutTextRun {
  const first = item[0] as LayoutTextRun;
  const last = item.at(-1) ?? first;
  const text = item.map((run) => run.text).join('');
  const numeral = NUMERAL.exec(text)?.[0] ?? '';
  const dashed = /[-–—\u0097]/.test(text.replace(numeral, ''));
  return {
    ...first,
    text: dashed ? `- ${numeral} -` : numeral,
    width: last.x + last.width - first.x,
    // Recognition sizes a word by its ink, and a digit between dashes has little: no smaller than the foot.
    sizePt: Math.max(...item.map((run) => run.sizePt), first.hidden === true ? footSizePt : 0),
    role: 'page-number',
  };
}

/** "Page 3 – Case No. 19-…": a foot line that opens by saying which page it is. */
const PAGE_LABEL = /^\s*page\s*(\d{1,4})(?!\d)(?!\s*of\b)/i;

/** The run holding the number of the one foot line that opens "Page N", and that number. */
function labelledNumber(page: PageLayout): { run: LayoutTextRun; value: number } | null {
  const found = footItems(page).flatMap((item) => {
    const digits = PAGE_LABEL.exec(item.map((run) => run.text).join(''))?.[1];
    const run = item.find((each) => /\d/.test(each.text));
    const value = digits === undefined ? null : numeralValue(digits);
    const first = run === undefined ? undefined : /\d+/.exec(run.text)?.[0];
    return value === null || run === undefined || first !== digits ? [] : [{ run, value }];
  });
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** A page the viewer found no number on, with the number its foot prints marked as one. */
function withFootNumber(page: PageLayout): PageLayout {
  if (page.printedPageNumber !== null || numberRuns(page).length > 0) return page;
  const found = loneNumber(page);
  if (found === null) return withLabelledNumber(page);
  const kept = page.runs.filter((run) => !found.item.includes(run));
  const footSizePt = Math.max(
    0,
    ...kept.filter((run) => run.role === 'footer').map((run) => run.sizePt)
  );
  const number = asOneRun(found.item, footSizePt);
  return { ...page, printedPageNumber: found.value, runs: [...kept, number] };
}

function withLabelledNumber(page: PageLayout): PageLayout {
  const found = labelledNumber(page);
  if (found === null) return page;
  return {
    ...page,
    printedPageNumber: found.value,
    runs: page.runs.map((run) =>
      run === found.run ? { ...run, role: 'page-number' as const } : run
    ),
  };
}

function isRecognized(page: PageLayout): boolean {
  return page.runs.length > 0 && page.runs.every((run) => run.hidden === true);
}

function footText(page: PageLayout): string {
  return page.runs
    .filter((run) => run.role === 'footer')
    .map((run) => run.text)
    .join('');
}

/** How much of the shorter foot's reading the longer one bears out, to call them one foot. */
const SAME_FOOT = 0.6;

function numbered(page: PageLayout | undefined): { value: number; style: NumberStyle } | null {
  if (page === undefined || page.printedPageNumber === null) return null;
  const style = numberStyleOf(page);
  return style === null ? null : { value: page.printedPageNumber, style };
}

/** The number a scanned page must have printed, going by the pages either side; null when they do not say. */
function inferred(
  page: PageLayout,
  before: PageLayout | undefined,
  after: PageLayout | undefined
): number | null {
  const a = numbered(before);
  if (a === null || before === undefined) return null;
  const b = numbered(after);
  // Two pages that count straight across it.
  if (b !== null) return b.value - a.value === 2 && b.style === a.style ? a.value + 1 : null;
  // A page behind a numbered one, carrying what can be read of the same running foot.
  return overlap(footText(page), footText(before)) >= SAME_FOOT ? a.value + 1 : null;
}

/**
 * A scanned page whose number the recognition missed still printed one: it
 * takes the number its neighbours imply, and with it the footer they carry.
 */
function withInferredNumbers(pages: readonly PageLayout[]): PageLayout[] {
  const settled: PageLayout[] = [];
  pages.forEach((page, index) => {
    const before = settled.at(-1);
    const value =
      page.printedPageNumber === null && isRecognized(page)
        ? inferred(page, before, pages[index + 1])
        : null;
    const [number] = before === undefined ? [] : numberRuns(before);
    if (value === null || number === undefined) settled.push(page);
    else settled.push({ ...page, printedPageNumber: value, runs: [...page.runs, number] });
  });
  return settled;
}

/** Every page with the number its foot prints read off it, where the viewer found none. */
export function withFootNumbers(layouts: readonly PageLayout[]): PageLayout[] {
  return withInferredNumbers(layouts.map(withFootNumber));
}

/** The page counts on from the one before it, in the same style — or neither prints a number. */
function continues(previous: PageLayout, page: PageLayout): boolean {
  const a = previous.printedPageNumber;
  const b = page.printedPageNumber;
  if (a === null || b === null) return a === b;
  return b - a === 1 && numberStyleOf(previous) === numberStyleOf(page);
}

/**
 * Splitting says nothing true about a sheet that prints several numbers (a
 * condensed transcript) or the same "number" on every page (a phone number).
 */
function splittable(pages: readonly PageLayout[]): boolean {
  const known = pages.filter((page) => page.printedPageNumber !== null);
  if (pages.some((page) => numberRuns(page).length > 1)) return false;
  const values = new Set(known.map((page) => page.printedPageNumber));
  return !(known.length > 1 && values.size === 1);
}

/**
 * The pages cut wherever the numbering stops, restarts or changes style, so
 * each stretch can be one Word section that counts the way its pages did.
 * `opensRun` says when a lone unnumbered page belongs with the numbered
 * stretch behind it — a caption page, kept as Word's "different first page".
 */
export function numberingRuns(
  pages: PageLayout[],
  opensRun: (merged: readonly PageLayout[]) => boolean
): PageLayout[][] {
  if (!splittable(pages)) return [pages];
  const runs: PageLayout[][] = [];
  for (const page of pages) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (run !== undefined && previous !== undefined && continues(previous, page)) run.push(page);
    else runs.push([page]);
  }
  return runs.reduce<PageLayout[][]>((merged, run) => {
    const opener = merged.at(-1);
    const lone = opener?.length === 1 && opener[0]?.printedPageNumber === null;
    if (opener !== undefined && lone && opensRun([...opener, ...run])) opener.push(...run);
    else merged.push(run);
    return merged;
  }, []);
}

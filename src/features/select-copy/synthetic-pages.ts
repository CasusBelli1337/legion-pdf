/**
 * Hand-built pages for the classifier's tests: pleading paper, a four-up
 * condensed transcript sheet, and a plain page with no margin numbers at all.
 *
 * The classifier only ever sees numbers — a string, a text matrix, a width and
 * a height — so a page can be built here exactly as pdfjs would report it, and
 * every heuristic is testable without rendering a PDF. The geometry mirrors the
 * real fixtures written by `qa/make-fixtures.mjs`, so a rule proved here is a
 * rule proved on the fixture.
 */

import type { PageSize } from '@shared/types';
import type { TextItemLike } from './item-geometry';
import type { ClassifiedPage, PageInput } from './page-classifier';
import type { PageSelection } from './smart-text';

export const LETTER: PageSize = { width: 612, height: 792 };
export const LETTER_LANDSCAPE: PageSize = { width: 792, height: 612 };

/** Average glyph advance as a fraction of type size — close enough for layout. */
const ADVANCE = 0.5;

export interface Placed {
  text: string;
  x: number;
  y: number;
  size?: number;
}

export function itemOf(placed: Placed): TextItemLike {
  const size = placed.size ?? 11;
  return {
    str: placed.text,
    transform: [size, 0, 0, size, placed.x, placed.y],
    width: placed.text.length * size * ADVANCE,
    height: size,
  };
}

export function pageOf(page: number, placed: readonly Placed[], size = LETTER): PageInput {
  return { page, items: placed.map(itemOf), size };
}

export interface PleadingOptions {
  page: number;
  /** The number printed at the bottom. Omit for a cover sheet that has none. */
  printed?: number;
  /** Body text, line 1 first. Empty strings leave the line blank. */
  lines: readonly string[];
  lineCount?: number;
  header?: string;
  bates?: string;
  /** Extra indent for these 1-based line numbers — a paragraph's first line. */
  indented?: readonly number[];
}

const PLEADING_TOP = 720;
const PLEADING_LEADING = 24;
const PLEADING_BODY_X = 90;

/** Pleading paper: numbers 1-28 down the left margin, body to their right. */
export function pleadingPage(options: PleadingOptions): PageInput {
  const lineCount = options.lineCount ?? 28;
  const placed: Placed[] = [];
  if (options.header !== undefined) placed.push({ text: options.header, x: 90, y: 760, size: 9 });

  for (let line = 1; line <= lineCount; line += 1) {
    const y = PLEADING_TOP - (line - 1) * PLEADING_LEADING;
    placed.push({ text: String(line), x: 54, y, size: 10 });
    const text = options.lines[line - 1];
    if (text === undefined || text === '') continue;
    const indent = options.indented?.includes(line) === true ? 18 : 0;
    placed.push({ text, x: PLEADING_BODY_X + indent, y });
  }

  if (options.bates !== undefined) placed.push({ text: options.bates, x: 430, y: 30, size: 9 });
  if (options.printed !== undefined) {
    placed.push({ text: String(options.printed), x: 300, y: 44, size: 10 });
  }
  return pageOf(options.page, placed);
}

export interface MiniPage {
  /** The number printed at the top of this mini-page. */
  number: number;
  lines: readonly string[];
  lineCount?: number;
}

const MINI_TOP = 270;
const MINI_LEADING = 10;

/** Quadrant origins in reading order: top-left, bottom-left, top-right, bottom-right. */
const QUADRANT_ORIGINS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 306 },
  { x: 0, y: 0 },
  { x: 396, y: 306 },
  { x: 396, y: 0 },
];

function miniPagePlacements(mini: MiniPage, origin: { x: number; y: number }): Placed[] {
  const lineCount = mini.lineCount ?? 25;
  const placed: Placed[] = [
    { text: String(mini.number), x: origin.x + 330, y: origin.y + 285, size: 8 },
  ];
  for (let line = 1; line <= lineCount; line += 1) {
    const y = origin.y + MINI_TOP - (line - 1) * MINI_LEADING;
    placed.push({ text: String(line), x: origin.x + 20, y, size: 7 });
    const text = mini.lines[line - 1];
    if (text !== undefined && text !== '') placed.push({ text, x: origin.x + 40, y, size: 7 });
  }
  return placed;
}

/**
 * A condensed transcript sheet: FOUR mini-pages, 2x2, each with its own 1-25
 * line column and its own printed number. `minis` are given in reading order.
 */
export function condensedSheet(page: number, minis: readonly MiniPage[]): PageInput {
  const placed = minis.flatMap((mini, index) => {
    const origin = QUADRANT_ORIGINS[index] ?? QUADRANT_ORIGINS[0];
    return origin === undefined ? [] : miniPagePlacements(mini, origin);
  });
  return pageOf(page, placed, LETTER_LANDSCAPE);
}

/** Everything on the page selected — the drag an attorney makes over a whole page. */
export function selectWholePage(page: ClassifiedPage): PageSelection {
  return {
    page,
    slices: page.positioned.map((item) => ({
      itemIndex: item.itemIndex,
      from: 0,
      to: item.item.str.length,
    })),
  };
}

/** Only the items whose text passes `wanted` — a drag over part of a page. */
export function selectWhere(
  page: ClassifiedPage,
  wanted: (text: string) => boolean
): PageSelection {
  return {
    page,
    slices: page.positioned
      .filter((item) => wanted(item.item.str))
      .map((item) => ({ itemIndex: item.itemIndex, from: 0, to: item.item.str.length })),
  };
}

/** An ordinary page: prose, a footer number, and no margin numbers anywhere. */
export function plainPage(page: number, lines: readonly string[], printed?: number): PageInput {
  const placed: Placed[] = lines.map((text, index) => ({
    text,
    x: 90,
    y: PLEADING_TOP - index * 18,
  }));
  if (printed !== undefined) placed.push({ text: String(printed), x: 300, y: 44, size: 10 });
  return pageOf(page, placed);
}

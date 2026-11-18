/**
 * A pleading section's pages, made ready to share one header of numbers.
 *
 * Word draws the numbered column once per section, so every page gets the
 * same grid. Two things on real filings do not fit that as they come:
 *
 * - A scanned filing's pages each sat a little differently on the glass: the
 *   whole page — numbers and text together — is a point or three higher or
 *   lower than its neighbours. Left alone, the text follows its own page and
 *   the numbers follow the section, and line 14 drifts off number 14. Each
 *   page is moved onto the section's grid instead, text and all, so a line
 *   stays beside its number exactly as it did on paper.
 * - A court's own order may set its text below the numbers' baselines, and a
 *   footnote may run under line 28. The viewer's classifier calls everything
 *   under the last number a footer; a line just under it that no other page
 *   repeats is the page's last line of text, and is given back to the body.
 */

import type { LayoutTextRun, PageLayout } from '@shared/types';
import { median } from './paragraphs';
import { pleadingOf, pleadingOfSection } from './pleading';
import type { Pleading } from './pleading';
import { withoutStrays } from './recognized-pages';

/** Pitches further apart than this share are different paper, not one scanner's wobble. */
const PITCH_TOLERANCE = 0.02;
/** A page this close to the grid, points, is on it. */
const ON_GRID = 0.1;
/** A page further off than this (× pitch) is not the same grid moved; it stays put. */
const MAX_SHIFT = 0.5;
/** How far under the last number (× pitch) a line of body text may sit. */
const UNDER_LAST_LINE = 0.75;
/** A foot is set smaller than the body; a line at least this share of the body's size is not one. */
const BODY_SIZE_SHARE = 0.8;
/** Runs within this many points of each other share a baseline. */
const SAME_LINE = 2.5;

/** False when both pages carry a numbered grid and the two are on different pitches. */
export function sameGrid(a: PageLayout, b: PageLayout): boolean {
  const first = pleadingOf(a);
  const second = pleadingOf(b);
  if (first === null || second === null || !first.grid || !second.grid) return true;
  return Math.abs(first.pitchPt - second.pitchPt) <= PITCH_TOLERANCE * first.pitchPt;
}

function moved(layout: PageLayout, dy: number): PageLayout {
  return {
    ...layout,
    runs: layout.runs.map((run) => ({ ...run, y: run.y + dy })),
    images: layout.images.map((image) => ({
      ...image,
      rect: { ...image.rect, y: image.rect.y + dy },
    })),
    rules: layout.rules.map((rule) => ({ rect: { ...rule.rect, y: rule.rect.y + dy } })),
  };
}

/** How far below the paper's top edge the page's line 1 sits, or null without a grid. */
function lineOneDepth(layout: PageLayout): number | null {
  const own = pleadingOf(layout);
  return own === null || !own.grid ? null : layout.size.height - own.firstBaseline;
}

/**
 * The page moved so its line 1 is as far below the top edge as the section's.
 * Measured from the top because Word places from the top, and on the first
 * page's sheet because that is the paper the section is given — a scanner's
 * pages differ in height by a point, and a page read from its own bottom edge
 * would land that point out.
 */
function onGrid(
  layout: PageLayout,
  depth: number,
  sheetHeight: number,
  pitchPt: number
): PageLayout {
  const own = lineOneDepth(layout);
  if (own === null) return layout;
  const dy = sheetHeight - depth - (layout.size.height - own);
  if (Math.abs(dy) <= ON_GRID || Math.abs(own - depth) > MAX_SHIFT * pitchPt) return layout;
  return moved(layout, dy);
}

/** Digits aside, the same words: "Page 3 of 14" and "Page 4 of 14" repeat. */
function normalized(runs: readonly LayoutTextRun[]): string {
  return runs
    .map((run) => run.text)
    .join('')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** The page's footer runs gathered into lines, top down. */
function footerLines(layout: PageLayout): LayoutTextRun[][] {
  const runs = layout.runs
    .filter((run) => run.role === 'footer' && run.text.trim().length > 0)
    .sort((a, b) => b.y - a.y);
  const lines: LayoutTextRun[][] = [];
  for (const run of runs) {
    const line = lines.at(-1);
    const first = line?.[0];
    if (line !== undefined && first !== undefined && first.y - run.y <= SAME_LINE) line.push(run);
    else lines.push([run]);
  }
  return lines;
}

function lastNumberBaseline(layout: PageLayout): number | null {
  const numbers = layout.runs.filter((run) => run.role === 'line-number').map((run) => run.y);
  return numbers.length === 0 ? null : Math.min(...numbers);
}

/** The type size most of the page's body is set in, or zero on a page with none. */
function bodySize(layout: PageLayout): number {
  const sizes = layout.runs
    .filter((run) => run.role === 'body' && run.text.trim().length > 0)
    .map((run) => run.sizePt);
  return sizes.length === 0 ? 0 : median(sizes);
}

/**
 * A line of body text and not a foot: right of the numbers (a firm's slug and
 * a document ID begin in the margin under them) and in the body's own size (a
 * foot is set smaller).
 */
function readsAsBody(
  line: readonly LayoutTextRun[],
  layout: PageLayout,
  section: Pleading
): boolean {
  const left = Math.min(...line.map((run) => run.x));
  const size = median(line.map((run) => run.sizePt));
  return left >= section.numberRight && size >= BODY_SIZE_SHARE * bodySize(layout);
}

/** The page with its last line of text — set just under the last number — back in the body. */
function withLastLine(
  layout: PageLayout,
  section: Pleading,
  repeated: ReadonlySet<string>
): PageLayout {
  const last = lastNumberBaseline(layout);
  if (last === null) return layout;
  const reclaimed = new Set(
    footerLines(layout)
      .filter((line) => (line[0]?.y ?? 0) >= last - UNDER_LAST_LINE * section.pitchPt)
      .filter((line) => !repeated.has(normalized(line)) && readsAsBody(line, layout, section))
      .flat()
  );
  if (reclaimed.size === 0) return layout;
  return {
    ...layout,
    runs: layout.runs.map((run) => (reclaimed.has(run) ? { ...run, role: 'body' } : run)),
  };
}

/** Footer lines that more than one page carries — the real running foot. */
function repeatedFeet(pages: readonly PageLayout[]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const key of new Set(footerLines(page).map(normalized))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

/** A section's pages as the builder should see them; untouched when the section has no grid. */
export function pleadingPagesOf(source: PageLayout[]): PageLayout[] {
  const section = pleadingOfSection(source);
  if (section === null) return source;
  const pages = source.map((page) => withoutStrays(page, section));
  if (!section.grid) return pages;
  const repeated = repeatedFeet(pages);
  const depths = pages.flatMap((page) => lineOneDepth(page) ?? []);
  const sheetHeight = pages[0]?.size.height ?? 0;
  const depth = median(depths);
  return pages.map((page) =>
    onGrid(withLastLine(page, section, repeated), depth, sheetHeight, section.pitchPt)
  );
}

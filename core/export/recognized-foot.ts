/**
 * A scanned filing's foot is read by recognition, page by page, and no two
 * readings agree: one page's document number is clean, the next's is
 * "4856.9844—ioss.i". The Word footer is built from ONE page's foot — so it
 * is built from the reading the other pages most agree with, not from
 * whichever page happens to come first.
 */

import type { LayoutTextRun, PageLayout } from '@shared/types';

/** More pages than this say nothing new about a foot that repeats. */
const SAMPLE = 12;

function pairs(text: string): Set<string> {
  const clean = text.replace(/\s+/g, '').toUpperCase();
  const found = new Set<string>();
  for (let index = 0; index < clean.length - 1; index += 1)
    found.add(clean.slice(index, index + 2));
  return found;
}

/** Shared letter pairs over all letter pairs: 1 for the same words, 0 for none in common. */
function likeness(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const pair of a) if (b.has(pair)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** The share of the shorter text's letter pairs the other text also has: a clipped reading still matches. */
export function overlap(a: string, b: string): number {
  const [first, second] = [pairs(a), pairs(b)];
  const smaller = Math.min(first.size, second.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const pair of first) if (second.has(pair)) shared += 1;
  return shared / smaller;
}

function isRecognized(runs: readonly LayoutTextRun[]): boolean {
  return runs.length > 0 && runs.every((run) => run.hidden === true);
}

/**
 * The pages to read the foot off, best first. Printed text is left alone: the
 * first page's foot is every page's. Recognised feet are ranked by how well
 * the other pages bear each out; a page that kept its number outranks one
 * whose number the recognition lost.
 */
export function clearestFootFirst(
  pages: readonly PageLayout[],
  footOf: (page: PageLayout) => LayoutTextRun[]
): readonly PageLayout[] {
  const feet = pages
    .map((page) => ({ page, runs: footOf(page) }))
    .filter((foot) => foot.runs.length > 0)
    .slice(0, SAMPLE);
  if (feet.length < 3 || !feet.every((foot) => isRecognized(foot.runs))) return pages;
  const read = feet.map((foot) => ({
    page: foot.page,
    numbered: foot.runs.some((run) => run.role === 'page-number'),
    pairs: pairs(foot.runs.map((run) => run.text).join('')),
  }));
  const anyNumbered = read.some((foot) => foot.numbered);
  const ranked = read
    .filter((foot) => foot.numbered === anyNumbered)
    .map((foot) => ({
      page: foot.page,
      score: read.reduce((sum, other) => sum + likeness(foot.pairs, other.pairs), 0),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.page;
  return best === undefined ? pages : [best, ...pages.filter((page) => page !== best)];
}

const DASH = /[-\u2010-\u2015\u0097]/;
const ONLY_DASH = /^[-\u2010-\u2015\u0097]$/;
/** Punctuation this close to a page number (× its size), on its line, is part of how it prints. */
const ATTENDS_WITHIN = 2;
/** Runs within this many points of each other share a baseline. */
const SAME_LINE = 2;

/**
 * True for the dashes of "- 2 -": recognised punctuation right beside the
 * page's number, on its line. Alone such a run is scanner noise; here it is
 * how the filing prints its page numbers.
 */
export function attendsPageNumber(run: LayoutTextRun, page: PageLayout): boolean {
  if (run.hidden !== true || !ONLY_DASH.test(run.text.trim())) return false;
  return page.runs.some((number) => {
    if (number.role !== 'page-number' || Math.abs(number.y - run.y) > SAME_LINE) return false;
    // A number already read with its dashes ("- 2 -") has them.
    if (DASH.test(number.text)) return false;
    const gap = Math.max(run.x - (number.x + number.width), number.x - (run.x + run.width));
    return gap <= ATTENDS_WITHIN * Math.max(number.sizePt, run.sizePt);
  });
}

/**
 * The foot's page number in the face and size most pages print it in. A
 * scan's number is read in whatever the recognition made of each page — bold
 * thirteen point on one, plain twelve on the rest — and the footer is built
 * from one page.
 */
export function withCommonNumberStyle(
  band: readonly LayoutTextRun[],
  pages: readonly PageLayout[]
): LayoutTextRun[] {
  const isNumber = (run: LayoutTextRun): boolean =>
    run.role === 'page-number' && run.hidden === true;
  const counts = new Map<string, { run: LayoutTextRun; count: number }>();
  for (const run of pages.flatMap((page) => page.runs.filter(isNumber))) {
    const key = `${run.fontKey}|${Math.round(run.sizePt * 2)}`;
    counts.set(key, { run, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  const common = [...counts.values()].sort((a, b) => b.count - a.count)[0]?.run;
  if (common === undefined) return [...band];
  return band.map((run) =>
    isNumber(run) ? { ...run, fontKey: common.fontKey, sizePt: common.sizePt } : run
  );
}

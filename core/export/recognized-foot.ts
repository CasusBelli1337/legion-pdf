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

/**
 * "Different first page": a filing's caption page carries the running foot
 * but no page number, and every page after it is numbered. Word says that
 * with a first-page footer. Read off the first page alone, the section's
 * footer had no number at all and pages 2, 3, 4… lost theirs.
 */

import type { LayoutTextRun, PageLayout } from '@shared/types';
import { PAGE_FIELD } from './docx-paragraph';

function hasPageNumber(page: PageLayout): boolean {
  return page.runs.some((run) => run.role === 'page-number' && run.text.trim().length > 0);
}

/**
 * True when the section's first page prints no page number and every later
 * page prints its own place in the document — the one case a PAGE field in
 * the default footer and a separate first-page footer reproduce exactly.
 */
export function firstPageDiffers(pages: readonly PageLayout[]): boolean {
  const [first, ...rest] = pages;
  if (first === undefined || rest.length === 0 || hasPageNumber(first)) return false;
  return rest.every((page) => hasPageNumber(page) && page.printedPageNumber === page.page);
}

/**
 * The number Word must give the section's first page for a PAGE field to
 * print what the pages printed: a transcript excerpt that opens on page 45
 * starts at 45, and a section behind one that restarted its numbering does
 * not inherit the restart. Undefined when no page of the section says.
 */
export function pageNumberStart(pages: readonly PageLayout[]): number | undefined {
  const first = pages[0];
  const known = pages.find((page) => page.printedPageNumber !== null && hasPageNumber(page));
  if (first === undefined || known === undefined || known.printedPageNumber === null) {
    return undefined;
  }
  const start = known.printedPageNumber - (known.page - first.page);
  return start >= 0 ? start : undefined;
}

/** The printed numbers rise by one from each page to the next (where both are known). */
export function countsPages(pages: readonly PageLayout[]): boolean {
  const known = pages.filter((page) => page.printedPageNumber !== null);
  if (known.length <= 1) return true;
  return known.slice(1).every((page, index) => {
    const previous = known[index];
    return (
      previous !== undefined &&
      (page.printedPageNumber ?? 0) - (previous.printedPageNumber ?? 0) ===
        page.page - previous.page
    );
  });
}

function sameOnEveryPage(pages: readonly PageLayout[]): boolean {
  const printed = new Set(pages.map((page) => page.printedPageNumber));
  return printed.size === 1;
}

/**
 * The foot's runs with the printed page number turned into a PAGE field —
 * or kept as text, or left out, as the pages allow.
 */
export function footRuns(
  pages: readonly PageLayout[],
  band: readonly LayoutTextRun[]
): { runs: LayoutTextRun[]; numberDropped: boolean } {
  // Several printed numbers on one sheet (a condensed transcript) are not the
  // sheet's number: no field can stand in for them. Nor can one stand in for a
  // number that does not count up page by page.
  const numbers = band.filter((run) => run.role === 'page-number').length;
  const counting = numbers === 1 && countsPages(pages);
  // The same "number" on every page (a reporter's phone number) is just text.
  const literal = numbers === 1 && !counting && sameOnEveryPage(pages);
  const runs = band
    .filter((run) => run.role !== 'page-number' || counting || literal)
    .map((run) =>
      run.role === 'page-number' && counting
        ? { ...run, text: run.text.replace(/\d+/, PAGE_FIELD) }
        : run
    );
  // One page's number printed on every page is worse than none: where no
  // field can stand in for it, the number is left out and the receipt says so.
  return { runs, numberDropped: numbers > 0 && !counting && !literal };
}

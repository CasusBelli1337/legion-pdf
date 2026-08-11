/**
 * The page-range box every stamping panel carries: "all", "1-30, 45", "12".
 *
 * Core validates ranges again on the main side (that is the gate that matters),
 * but the attorney should never have to send a request to find out a range is
 * nonsense — so the same rules are checked here, in the words they need to fix
 * it. The renderer cannot import core, so this is deliberately its own parser.
 */

const TOKEN = /^(\d+)(?:\s*-\s*(\d+))?$/;
const EXAMPLE = 'for example 1-30, 45';

export interface PageRangeResult {
  /** Sorted, de-duplicated 1-based page numbers. Empty whenever `error` is set. */
  pages: number[];
  /** Plain-English problem with the input, or null when it is usable. */
  error: string | null;
}

/** "All pages" as typed — the default every panel starts with. */
export const ALL_PAGES = 'all';

export function everyPage(pageCount: number): number[] {
  return Array.from({ length: pageCount }, (_unused, index) => index + 1);
}

function expand(token: string, pageCount: number, into: Set<number>): string | null {
  const match = TOKEN.exec(token);
  if (match === null || match[1] === undefined) {
    return `"${token}" is not a page number or a range. Type page numbers, ${EXAMPLE}.`;
  }
  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  if (first < 1) return 'Pages start at 1.';
  if (first > last) return `The range "${token}" runs backwards. Write it as ${last}-${first}.`;
  if (last > pageCount) return `This document ends at page ${pageCount}, so "${token}" is too far.`;
  for (let page = first; page <= last; page += 1) into.add(page);
  return null;
}

/** Parses the range box. `pages` is empty whenever `error` is set. */
export function parsePageRange(input: string, pageCount: number): PageRangeResult {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === ALL_PAGES) {
    return { pages: everyPage(pageCount), error: null };
  }

  const tokens = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (tokens.length === 0) {
    return { pages: [], error: `Type which pages to mark, or "all". ${EXAMPLE}.` };
  }

  const pages = new Set<number>();
  for (const token of tokens) {
    const problem = expand(token, pageCount, pages);
    if (problem !== null) return { pages: [], error: problem };
  }
  return { pages: [...pages].sort((a, b) => a - b), error: null };
}

/** "20 pages" / "1 page" — the count under the range box. */
export function describePageCount(count: number): string {
  return `${count} ${count === 1 ? 'page' : 'pages'}`;
}

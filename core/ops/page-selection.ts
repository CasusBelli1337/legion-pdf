/**
 * Page selection: the gate every op passes through before it touches a
 * document. Ranges are validated against the REAL page count here, so a window
 * that selects nothing throws instead of quietly producing an empty result.
 */

import { RangeCollapseError } from '@shared/types';

const RANGE_PATTERN = /^(\d+)(?:\s*-\s*(\d+))?$/;
/** A single range token from a spec such as "1-30, 45, 60-62". */
interface ParsedToken {
  first: number;
  last: number;
}

function parseToken(token: string, spec: string): ParsedToken {
  const match = RANGE_PATTERN.exec(token);
  if (match === null || match[1] === undefined) {
    throw new RangeError(
      `"${token}" in "${spec}" is not a page number or a range — use something like 1-30, 45, 60-62.`
    );
  }
  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  if (first > last) {
    throw new RangeError(`Range "${token}" runs backwards — write it as ${last}-${first}.`);
  }
  return { first, last };
}

function assertWithinDocument(token: ParsedToken, pageCount: number, spec: string): void {
  if (token.first < 1) {
    throw new RangeError(`"${spec}" asks for page ${token.first}; pages start at 1.`);
  }
  if (token.last > pageCount) {
    throw new RangeError(
      `"${spec}" asks for page ${token.last}, but this document ends at page ${pageCount}.`
    );
  }
}

/**
 * Parses a human page range ("1-30, 45, 60-62") into sorted, de-duplicated
 * 1-based page numbers. Throws RangeCollapseError when the spec selects nothing.
 */
export function parsePageRanges(spec: string, pageCount: number): number[] {
  const tokens = spec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (tokens.length === 0) throw new RangeCollapseError(spec, pageCount);

  const pages = new Set<number>();
  for (const token of tokens) {
    const parsed = parseToken(token, spec);
    assertWithinDocument(parsed, pageCount, spec);
    for (let page = parsed.first; page <= parsed.last; page += 1) pages.add(page);
  }
  if (pages.size === 0) throw new RangeCollapseError(spec, pageCount);
  return [...pages].sort((a, b) => a - b);
}

/**
 * Validates an explicit page list (from thumbnail selection) against the real
 * document: every entry a whole number inside 1..pageCount, at least one left.
 */
export function normalizePages(
  pages: readonly number[],
  pageCount: number,
  label = 'selection'
): number[] {
  const unique = new Set<number>();
  for (const page of pages) {
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new RangeError(
        `The ${label} includes page ${page}, but this document has pages 1 through ${pageCount}.`
      );
    }
    unique.add(page);
  }
  if (unique.size === 0) throw new RangeCollapseError(label, pageCount);
  return [...unique].sort((a, b) => a - b);
}

/** Validates a complete 1-based permutation — every page exactly once, no gaps. */
export function assertPermutation(order: readonly number[], pageCount: number): number[] {
  if (order.length !== pageCount) {
    throw new RangeError(
      `The new page order lists ${order.length} pages but the document has ${pageCount}.`
    );
  }
  const seen = new Set<number>();
  for (const page of order) {
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new RangeError(`The new page order includes page ${page}, which does not exist.`);
    }
    if (seen.has(page)) {
      throw new RangeError(`The new page order lists page ${page} twice.`);
    }
    seen.add(page);
  }
  return [...order];
}

/** The pages NOT in `pages` — what survives a delete. Empty survivors throw. */
export function survivingPages(pages: readonly number[], pageCount: number): number[] {
  const removed = new Set(pages);
  const survivors: number[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    if (!removed.has(page)) survivors.push(page);
  }
  if (survivors.length === 0) {
    throw new RangeCollapseError(`all ${pageCount} pages`, pageCount);
  }
  return survivors;
}

/** pdf-lib indexes pages from zero; the whole app talks to the user in 1-based. */
export function toZeroBased(pages: readonly number[]): number[] {
  return pages.map((page) => page - 1);
}

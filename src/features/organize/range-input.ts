/**
 * The split dialog's range parser. Each comma-separated group becomes ONE
 * output document ("1-30, 31-60" splits a 60-page file in two), which is why
 * this cannot simply reuse the core parser: core turns a whole spec into one
 * page set, and the renderer is not allowed to import core anyway.
 *
 * Errors here are what the attorney reads, so they say what to type instead.
 */

const TOKEN = /^(\d+)(?:\s*-\s*(\d+))?$/;
const EXAMPLE = 'for example 1-30, 31-60';

export interface RangePart {
  /** The range exactly as it will be sent to the split operation. */
  spec: string;
  first: number;
  last: number;
  pageCount: number;
}

export interface RangeInputResult {
  parts: RangePart[];
  /** Plain-English problem with the input, or null when it is usable. */
  error: string | null;
}

function describe(token: string, pageCount: number): RangePart | string {
  const match = TOKEN.exec(token);
  if (match === null || match[1] === undefined) {
    return `"${token}" is not a page number or a range. Type page numbers, ${EXAMPLE}.`;
  }
  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  if (first < 1) return 'Pages start at 1.';
  if (first > last) return `The range "${token}" runs backwards. Write it as ${last}-${first}.`;
  if (last > pageCount) {
    return `This document ends at page ${pageCount}, so "${token}" is out of range.`;
  }
  return { spec: token, first, last, pageCount: last - first + 1 };
}

/** Parses the split box. `parts` is empty whenever `error` is set. */
export function parseRangeInput(input: string, pageCount: number): RangeInputResult {
  const tokens = input
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (tokens.length === 0) {
    return { parts: [], error: `Type the page ranges you want to split into, ${EXAMPLE}.` };
  }

  const parts: RangePart[] = [];
  for (const token of tokens) {
    const described = describe(token, pageCount);
    if (typeof described === 'string') return { parts: [], error: described };
    parts.push(described);
  }
  return { parts, error: null };
}

/** "Pages 1-30 (30 pages)" — the preview line under the split box. */
export function describePart(part: RangePart): string {
  const pages =
    part.first === part.last ? `Page ${part.first}` : `Pages ${part.first}-${part.last}`;
  return `${pages} (${part.pageCount} ${part.pageCount === 1 ? 'page' : 'pages'})`;
}

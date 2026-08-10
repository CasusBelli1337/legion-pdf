/**
 * The search half of the ViewerApi contract. Matching itself is pure and
 * unit-tested; the pdfjs half only supplies text items page by page.
 *
 * Quads come back in PDF user space (origin bottom-left, points) so the
 * redaction lane can hand them straight to a core/ op without re-deriving
 * anything from the screen.
 */

import type { PdfRect, TextMatch } from '@shared/types';

/** The slice of a pdfjs TextItem the matcher needs. */
export interface SearchTextItem {
  str: string;
  /** PDF-space text matrix [a, b, c, d, e, f]; (e, f) is the baseline origin. */
  transform: readonly number[];
  /** Advance width of the whole run, in PDF points. */
  width: number;
  /** Run height, in PDF points. */
  height: number;
}

export interface PageSearchResult {
  matches: TextMatch[];
  /** Ordinal to hand the next page, so `TextMatch.index` runs document-wide. */
  nextIndex: number;
}

interface ItemSpan {
  item: SearchTextItem;
  start: number;
  end: number;
}

function spansOf(items: readonly SearchTextItem[]): { spans: ItemSpan[]; text: string } {
  const spans: ItemSpan[] = [];
  let text = '';
  for (const item of items) {
    if (item.str === '') continue;
    spans.push({ item, start: text.length, end: text.length + item.str.length });
    text += item.str;
  }
  return { spans, text };
}

/** One axis-aligned box for the [from, to) character slice of a single run. */
function quadForSlice(item: SearchTextItem, from: number, to: number): PdfRect {
  const length = item.str.length;
  const [a = 0, b = 0, , , e = 0, f = 0] = item.transform;
  const direction = Math.hypot(a, b);
  const unitX = direction === 0 ? 1 : a / direction;
  const unitY = direction === 0 ? 0 : b / direction;
  const perChar = length === 0 ? 0 : item.width / length;
  const offset = perChar * from;
  const width = perChar * (to - from);
  return {
    x: e + unitX * offset,
    y: f + unitY * offset,
    width: Math.max(width, 0.01),
    height: Math.max(item.height, 1),
  };
}

function quadsForRange(spans: readonly ItemSpan[], start: number, end: number): PdfRect[] {
  const quads: PdfRect[] = [];
  for (const span of spans) {
    if (span.end <= start || span.start >= end) continue;
    const from = Math.max(start, span.start) - span.start;
    const to = Math.min(end, span.end) - span.start;
    quads.push(quadForSlice(span.item, from, to));
  }
  return quads;
}

/**
 * Every case-insensitive hit for `query` on one page, including hits that run
 * across two text runs. `startIndex` continues the document-wide ordinal.
 */
export function findMatchesOnPage(
  items: readonly SearchTextItem[],
  query: string,
  page: number,
  startIndex: number
): PageSearchResult {
  const needle = query.trim().toLowerCase();
  if (needle === '') return { matches: [], nextIndex: startIndex };

  const { spans, text } = spansOf(items);
  const haystack = text.toLowerCase();
  const matches: TextMatch[] = [];
  let index = startIndex;
  let at = haystack.indexOf(needle);

  while (at !== -1) {
    const end = at + needle.length;
    const quads = quadsForRange(spans, at, end);
    if (quads.length > 0) {
      matches.push({ page, text: text.slice(at, end), index, quads });
      index += 1;
    }
    at = haystack.indexOf(needle, at + needle.length);
  }

  return { matches, nextIndex: index };
}

/**
 * "Perfect" as numbers. Two PDFs — the source and Word's rendering of the
 * export — are compared page by page: the same words, on the same baselines,
 * with the pleading line numbers on the same lines. Words are aligned by a
 * longest-common-subsequence over their text so a dropped or added word costs
 * one mismatch rather than shifting everything after it.
 */

import type { BboxPage, BboxWord } from './bbox';

export interface MatchedWord {
  text: string;
  /** Exported minus source, points; positive = lower on the page. */
  dy: number;
  dx: number;
  sourceY: number;
}

export interface NumberMatch {
  value: number;
  sourceY: number;
  /** Null when the export has no such number in the margin. */
  dy: number | null;
}

export interface PageFidelity {
  page: number;
  sourceWords: number;
  exportedWords: number;
  matched: MatchedWord[];
  /** Source words no exported word aligned with, in order. */
  missing: string[];
  /** Exported words no source word aligned with. */
  extra: string[];
  medianDy: number;
  p95Dy: number;
  maxDy: number;
  lineNumbers: NumberMatch[];
}

export interface Fidelity {
  sourcePages: number;
  exportedPages: number;
  pages: PageFidelity[];
}

/** Line numbers sit in the left margin: a bare 1–2 digit integer left of this share of the width. */
const MARGIN_SHARE = 0.18;

function normalize(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, '');
}

/** Longest common subsequence over normalised text; pairs of indexes in order. */
export function alignWords(
  source: readonly BboxWord[],
  exported: readonly BboxWord[]
): [number, number][] {
  const a = source.map((word) => normalize(word.text));
  const b = exported.map((word) => normalize(word.text));
  const table: Uint16Array[] = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i] as Uint16Array;
    const next = table[i + 1] as Uint16Array;
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j]
          ? (next[j + 1] as number) + 1
          : Math.max(next[j] as number, row[j + 1] as number);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (
      ((table[i + 1] as Uint16Array)[j] as number) >= ((table[i] as Uint16Array)[j + 1] as number)
    ) {
      i += 1;
    } else j += 1;
  }
  return pairs;
}

/** Words on one page and not the other, counted — order and position aside. */
function multisetDifference(
  source: readonly BboxWord[],
  exported: readonly BboxWord[]
): { missing: string[]; extra: string[] } {
  const counts = new Map<string, number>();
  for (const word of source)
    counts.set(normalize(word.text), (counts.get(normalize(word.text)) ?? 0) + 1);
  const extra: string[] = [];
  for (const word of exported) {
    const key = normalize(word.text);
    const left = counts.get(key) ?? 0;
    if (left > 0) counts.set(key, left - 1);
    else extra.push(word.text);
  }
  const missing = [...counts.entries()].flatMap(([key, count]) =>
    Array.from({ length: count }, () => key)
  );
  return { missing, extra };
}

function isMarginNumber(word: BboxWord, pageWidth: number): boolean {
  return /^\d{1,2}$/.test(word.text.trim()) && word.xMax < pageWidth * MARGIN_SHARE;
}

function quantile(values: readonly number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

function lineNumbersOf(source: BboxPage, exported: BboxPage): NumberMatch[] {
  const exportedNumbers = exported.words.filter((word) => isMarginNumber(word, exported.width));
  return source.words
    .filter((word) => isMarginNumber(word, source.width))
    .map((word) => {
      const value = Number(word.text);
      const candidates = exportedNumbers
        .filter((other) => Number(other.text) === value)
        .sort((x, y) => Math.abs(x.yMax - word.yMax) - Math.abs(y.yMax - word.yMax));
      const nearest = candidates[0];
      return {
        value,
        sourceY: word.yMax,
        dy: nearest === undefined ? null : nearest.yMax - word.yMax,
      };
    });
}

export function comparePage(source: BboxPage, exported: BboxPage): PageFidelity {
  const body = (page: BboxPage) => page.words.filter((word) => !isMarginNumber(word, page.width));
  const sourceBody = body(source);
  const exportedBody = body(exported);
  const pairs = alignWords(sourceBody, exportedBody);
  const matched = pairs.map(([i, j]) => {
    const from = sourceBody[i] as BboxWord;
    const to = exportedBody[j] as BboxWord;
    return {
      text: from.text,
      dy: to.yMax - from.yMax,
      dx: to.xMin - from.xMin,
      sourceY: from.yMax,
    };
  });
  const dys = matched.map((word) => Math.abs(word.dy));
  const { missing, extra } = multisetDifference(sourceBody, exportedBody);
  return {
    page: source.page,
    sourceWords: sourceBody.length,
    exportedWords: exportedBody.length,
    matched,
    missing,
    extra,
    medianDy: quantile(dys, 0.5),
    p95Dy: quantile(dys, 0.95),
    maxDy: dys.length === 0 ? 0 : Math.max(...dys),
    lineNumbers: lineNumbersOf(source, exported),
  };
}

export function compareDocuments(
  source: readonly BboxPage[],
  exported: readonly BboxPage[]
): Fidelity {
  const empty = (page: number): BboxPage => ({ page, width: 0, height: 0, words: [] });
  return {
    sourcePages: source.length,
    exportedPages: exported.length,
    pages: source.map((page, index) => comparePage(page, exported[index] ?? empty(page.page))),
  };
}

/** One line per page an attorney (or a failing test) can read. */
export function summarize(fidelity: Fidelity): string[] {
  const lines = [`pages: source ${fidelity.sourcePages}, export ${fidelity.exportedPages}`];
  for (const page of fidelity.pages) {
    const numbers = page.lineNumbers;
    const numbersOff = numbers.filter(
      (entry) => entry.dy === null || Math.abs(entry.dy) > 0.5
    ).length;
    lines.push(
      `p${page.page}: words ${page.sourceWords}→${page.exportedWords} (missing ${page.missing.length}, extra ${page.extra.length}); ` +
        `baseline dy median ${page.medianDy.toFixed(2)} p95 ${page.p95Dy.toFixed(2)} max ${page.maxDy.toFixed(2)}; ` +
        `line numbers ${numbers.length}${numbers.length > 0 ? `, off ${numbersOff}` : ''}`
    );
  }
  return lines;
}

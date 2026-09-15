/**
 * The court's electronic-filing stamp: a block of small text in its own face
 * in a top corner of the first pages — "Electronically Filed by Superior Court
 * of CA, County of Santa Clara, on 8/28/2025 … Envelope: 12345678" — laid
 * over the attorney block. It shares baselines with the body, so left as body
 * it welds itself onto every line it touches. It is a stamp: kept out of the
 * flow, and said so in the receipt.
 */

import type { LayoutTextRun } from '@shared/types';

/** The stamp lives in this corner: the top share of the page, the right share of the width. */
const TOP_SHARE = 0.72;
const RIGHT_SHARE = 0.55;
/** At least this many distinct baselines make a stamp block. */
const MIN_LINES = 3;
/** The stamp's opening words, whatever the county. */
const STAMP_TEXT =
  /electronically\s*filed|e-?filed|^\s*filed\b|filed\s+by\s+superior|clerk\s+of\s+the\s+court|envelope|reviewed\s+by|\bby:\s*[A-Z]/i;

function dominantFont(runs: readonly LayoutTextRun[]): string | null {
  const weight = new Map<string, number>();
  for (const run of runs) weight.set(run.fontKey, (weight.get(run.fontKey) ?? 0) + run.text.length);
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * The indexes (into `runs`) of an e-filing stamp's runs, or an empty set. The
 * block must sit in the corner, in a face the body is not set in, on several
 * baselines, and read like a filing stamp once joined.
 */
export function stampRunIndexes(
  runs: readonly LayoutTextRun[],
  size: { width: number; height: number }
): Set<number> {
  const inCorner = (run: LayoutTextRun) =>
    run.y >= TOP_SHARE * size.height && run.x >= RIGHT_SHARE * size.width;
  const body = runs.filter(
    (run) => run.role === 'body' && run.text.trim().length > 0 && !inCorner(run)
  );
  const bodyFont = dominantFont(body);
  const corner = runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) => run.role === 'body' && inCorner(run) && run.fontKey !== bodyFont);
  const baselines = new Set(corner.map(({ run }) => Math.round(run.y)));
  const text = corner
    .sort((a, b) => b.run.y - a.run.y || a.run.x - b.run.x)
    .map(({ run }) => run.text)
    .join('');
  if (baselines.size < MIN_LINES || !STAMP_TEXT.test(text)) return new Set();
  return new Set(corner.map(({ index }) => index));
}

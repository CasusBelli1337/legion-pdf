/**
 * Headers and footers, found the only way they can be found honestly: by
 * looking at more than one page. A running head ("SMITH v. JONES — DEPOSITION
 * OF J. SMITH") is ordinary prose sitting in an ordinary place; what gives it
 * away is that the SAME prose is at the top of every page.
 *
 * Digits are normalised to '#' before counting, so "Page 3 of 47" and
 * "Page 4 of 47" are recognised as one repeating band rather than two strangers.
 */

import type { PageSize } from '@shared/types';
import type { PositionedItem } from './item-geometry';

/**
 * How far into the page a header or footer can reach. Deliberately tighter
 * than it looks: a one-inch margin is 9% of a letter page, so anything past
 * that is inside the type block and is somebody's first line of text.
 */
export const BAND_FRACTION = 0.08;

/** Inside this much of an edge, an item is furniture whatever it says. */
export const EDGE_FRACTION = 0.06;

/** A band has to repeat on this share of the sampled pages to count. */
const REPEAT_SHARE = 0.6;

/** Below this many pages there is no such thing as a repeating band. */
const MIN_PAGES = 3;

export interface BandPage {
  items: readonly PositionedItem[];
  size: PageSize;
}

/** Case-folded, digit-blind, whitespace-collapsed — the identity of a band. */
export function normalizeBandText(text: string): string {
  return text.trim().toLowerCase().replace(/\d/g, '#').replace(/\s+/g, ' ');
}

export function inHeaderBand(y: number, size: PageSize): boolean {
  return y > size.height * (1 - BAND_FRACTION);
}

export function inFooterBand(y: number, size: PageSize): boolean {
  return y < size.height * BAND_FRACTION;
}

export function inEdgeBand(y: number, size: PageSize): boolean {
  return y > size.height * (1 - EDGE_FRACTION) || y < size.height * EDGE_FRACTION;
}

function bandTextOf(page: BandPage): Set<string> {
  const texts = new Set<string>();
  for (const item of page.items) {
    if (!inHeaderBand(item.box.y, page.size) && !inFooterBand(item.box.y, page.size)) continue;
    const text = normalizeBandText(item.item.str);
    if (text.length > 0) texts.add(text);
  }
  return texts;
}

/**
 * The normalised strings that recur in the top or bottom band across a sample
 * of the document. Everything else in those bands is left alone — a paragraph
 * that happens to run to the last line of the page is still body text.
 */
export function repeatedBandText(pages: readonly BandPage[]): Set<string> {
  if (pages.length < MIN_PAGES) return new Set();
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const text of bandTextOf(page)) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const threshold = Math.max(MIN_PAGES, Math.ceil(pages.length * REPEAT_SHARE));
  return new Set([...counts].filter(([, count]) => count >= threshold).map(([text]) => text));
}

/**
 * The seam between the text layer and selection intelligence.
 *
 * Every span pdfjs renders is stamped with two attributes:
 *   data-page        1-based PDF page the span belongs to
 *   data-item-index  the span's index in the array `getTextContent()` returned
 *
 * `data-item-index` COUNTS MARKED-CONTENT ENTRIES. pdfjs renders no span for
 * those (it opens a `.markedContent` wrapper instead), but dropping them from
 * the numbering would shift every later index by one and mis-role half the
 * page — so the index is the item's position in the original array, not its
 * position among the rendered spans. `src/features/select-copy` codes against
 * exactly this rule; the two must never drift.
 *
 * Roles come back the other way: once a page has been classified, the spans
 * that are line numbers, running heads, or Bates stamps are marked so a drag
 * over a paragraph yields the paragraph (see text-layer.css). No
 * classification means no attribute and today's behaviour, exactly.
 */

import type { TextRole } from '../../features/select-copy/contract';

export const PAGE_ATTRIBUTE = 'data-page';
export const ITEM_INDEX_ATTRIBUTE = 'data-item-index';
export const ROLE_ATTRIBUTE = 'data-role';

/** Only the `str` matters here; the rest of a pdfjs text item is irrelevant. */
function isRenderedItem(item: unknown): boolean {
  return (
    typeof item === 'object' && item !== null && typeof (item as { str?: unknown }).str === 'string'
  );
}

/**
 * The original index of each item pdfjs rendered a span for, in span order.
 * pdfjs renders a span for every item that has a `str` — empty strings
 * included — and none for a marked-content marker, which has no `str` at all.
 */
export function renderedItemIndexes(items: readonly unknown[]): number[] {
  const indexes: number[] = [];
  items.forEach((item, index) => {
    if (isRenderedItem(item)) indexes.push(index);
  });
  return indexes;
}

/**
 * Stamps the seam onto the rendered spans. Returns how many were stamped —
 * fewer than the spans given only when pdfjs truncated a pathological page.
 */
export function tagTextSpans(
  spans: readonly HTMLElement[],
  items: readonly unknown[],
  page: number
): number {
  const indexes = renderedItemIndexes(items);
  let tagged = 0;
  spans.forEach((span, position) => {
    const itemIndex = indexes[position];
    if (itemIndex === undefined) return;
    span.setAttribute(PAGE_ATTRIBUTE, String(page));
    span.setAttribute(ITEM_INDEX_ATTRIBUTE, String(itemIndex));
    tagged += 1;
  });
  return tagged;
}

/** The role map for one page, keyed by the same item index as the attribute. */
export type PageRoleMap = ReadonlyMap<number, TextRole>;

/**
 * Marks (or unmarks) every tagged span with its role. Idempotent, so it is safe
 * to call again when a classification lands after the page has already drawn.
 */
export function applyTextRoles(container: HTMLElement | null, roles: PageRoleMap | null): void {
  if (container === null) return;
  for (const span of container.querySelectorAll(`[${ITEM_INDEX_ATTRIBUTE}]`)) {
    const raw = span.getAttribute(ITEM_INDEX_ATTRIBUTE);
    const role = raw === null ? undefined : roles?.get(Number.parseInt(raw, 10));
    if (role === undefined) span.removeAttribute(ROLE_ATTRIBUTE);
    else span.setAttribute(ROLE_ATTRIBUTE, role);
  }
}

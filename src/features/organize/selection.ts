/**
 * Thumbnail selection and drag-reorder arithmetic. Pure functions so the grid
 * component stays about pixels and this stays testable.
 */

export type PageSelection = ReadonlySet<number>;

/** Plain click replaces the selection; Ctrl/Cmd click adds or removes one page. */
export function toggleSelection(
  selection: PageSelection,
  page: number,
  additive: boolean
): Set<number> {
  if (!additive) {
    return selection.size === 1 && selection.has(page) ? new Set() : new Set([page]);
  }
  const next = new Set(selection);
  if (next.has(page)) next.delete(page);
  else next.add(page);
  return next;
}

/** Shift click: everything from the anchor to the clicked page, inclusive. */
export function extendSelection(
  selection: PageSelection,
  anchor: number,
  page: number
): Set<number> {
  const next = new Set(selection);
  const from = Math.min(anchor, page);
  const to = Math.max(anchor, page);
  for (let current = from; current <= to; current += 1) next.add(current);
  return next;
}

export function selectAllPages(pageCount: number): Set<number> {
  return new Set(Array.from({ length: pageCount }, (_unused, index) => index + 1));
}

/**
 * What is selected when the panel opens: the page on screen. An attorney who
 * opens Organize while reading page 250 means that page — anything else asks him
 * to find it again in a grid of five hundred thumbnails.
 */
export function initialSelection(currentPage: number, pageCount: number): Set<number> {
  const page = Math.trunc(currentPage);
  if (pageCount < 1 || page < 1 || page > pageCount) return new Set();
  return new Set([page]);
}

/** The 0-based grid row a 1-based page sits in — what the grid scrolls to. */
export function rowOfPage(page: number, columns: number): number {
  return Math.max(0, Math.ceil(Math.max(1, Math.trunc(page)) / columns) - 1);
}

/** Scroll offset that brings a page's row into the middle of the grid. */
export function gridScrollTop(
  page: number,
  columns: number,
  rowHeight: number,
  viewportHeight: number
): number {
  const top = rowOfPage(page, columns) * rowHeight;
  return Math.max(0, top - Math.max(0, (viewportHeight - rowHeight) / 2));
}

/** Selected pages in document order — the shape every op wants. */
export function orderedSelection(selection: PageSelection): number[] {
  return [...selection].sort((a, b) => a - b);
}

/**
 * The full 1-based page order after dragging the selected pages so they land
 * immediately before `beforePage` (use pageCount + 1 to drop at the end).
 */
export function moveSelectionBefore(
  pageCount: number,
  selection: PageSelection,
  beforePage: number
): number[] {
  const moving = orderedSelection(selection);
  const rest: number[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    if (!selection.has(page)) rest.push(page);
  }
  const insertAt = rest.filter((page) => page < beforePage).length;
  return [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
}

/** True when the order is unchanged, so the UI can skip a pointless round trip. */
export function isSameOrder(order: readonly number[]): boolean {
  return order.every((page, index) => page === index + 1);
}

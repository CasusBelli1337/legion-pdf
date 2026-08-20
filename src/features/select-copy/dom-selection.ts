/**
 * Reading the live browser selection back into pdfjs coordinates.
 *
 * THE ASSUMPTION THIS LANE CODES AGAINST (viewer lane, `data-*` on every
 * text-layer span): each span the pdfjs `TextLayer` renders carries
 *   data-page        1-based PDF page index the span belongs to
 *   data-item-index  ordinal of the span's item within that page's textContent
 * and the span's text is that item's `str`, unmodified. Those two attributes
 * are the whole seam: with them a DOM Range becomes a list of (page, item,
 * character range) runs that the classifier can reason about. Without them the
 * functions here return nothing and every action degrades to disabled rather
 * than to a wrong answer.
 */

export const PAGE_ATTRIBUTE = 'data-page';
export const ITEM_INDEX_ATTRIBUTE = 'data-item-index';

/** Every span that carries the seam. */
export const SPAN_SELECTOR = `[${PAGE_ATTRIBUTE}][${ITEM_INDEX_ATTRIBUTE}]`;

/** Characters [from, to) of one pdfjs text item on one page. */
export interface SelectedRun {
  page: number;
  itemIndex: number;
  from: number;
  to: number;
}

const ELEMENT_NODE = 1;

function numberAttribute(element: Element, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function scopeOf(range: Range): Element | null {
  const container = range.commonAncestorContainer;
  return container.nodeType === ELEMENT_NODE ? (container as Element) : container.parentElement;
}

function spansIn(range: Range): Element[] {
  const scope = scopeOf(range);
  if (scope === null) return [];
  const candidates = scope.matches(SPAN_SELECTOR)
    ? [scope]
    : [...scope.querySelectorAll(SPAN_SELECTOR)];
  return candidates.filter((element) => range.intersectsNode(element));
}

/** The character offset the range starts/ends at inside one span. */
function offsetsIn(span: Element, range: Range): { from: number; to: number } {
  const length = span.textContent?.length ?? 0;
  const startsHere = span.contains(range.startContainer) && range.startContainer !== span;
  const endsHere = span.contains(range.endContainer) && range.endContainer !== span;
  return {
    from: startsHere ? range.startOffset : 0,
    to: endsHere ? range.endOffset : length,
  };
}

function runsFromRange(range: Range): SelectedRun[] {
  const runs: SelectedRun[] = [];
  for (const span of spansIn(range)) {
    const page = numberAttribute(span, PAGE_ATTRIBUTE);
    const itemIndex = numberAttribute(span, ITEM_INDEX_ATTRIBUTE);
    if (page === null || itemIndex === null) continue;
    const { from, to } = offsetsIn(span, range);
    if (to > from) runs.push({ page, itemIndex, from, to });
  }
  return runs;
}

/** Every run the selection touches, deduplicated and in reading order. */
export function runsFromSelection(selection: Selection | null): SelectedRun[] {
  if (selection === null || selection.isCollapsed) return [];
  const runs: SelectedRun[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    runs.push(...runsFromRange(selection.getRangeAt(index)));
  }
  return normalizeRuns(runs);
}

/**
 * Sorted by page then item, with runs over the same item merged. Two ranges
 * touching the same span (a multi-range selection) must not copy its text twice.
 */
export function normalizeRuns(runs: readonly SelectedRun[]): SelectedRun[] {
  const sorted = [...runs]
    .filter((run) => run.to > run.from)
    .sort((a, b) => a.page - b.page || a.itemIndex - b.itemIndex || a.from - b.from);

  const merged: SelectedRun[] = [];
  for (const run of sorted) {
    const previous = merged.at(-1);
    const contiguous =
      previous !== undefined &&
      previous.page === run.page &&
      previous.itemIndex === run.itemIndex &&
      run.from <= previous.to;
    if (contiguous && previous !== undefined) previous.to = Math.max(previous.to, run.to);
    else merged.push({ ...run });
  }
  return merged;
}

/** Distinct pages the selection touches, ascending. */
export function pagesOfRuns(runs: readonly SelectedRun[]): number[] {
  return [...new Set(runs.map((run) => run.page))].sort((a, b) => a - b);
}

export function isSelectedRuns(value: unknown): value is SelectedRun[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry): entry is SelectedRun =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as SelectedRun).page === 'number' &&
        typeof (entry as SelectedRun).itemIndex === 'number'
    )
  );
}

/** A DOM `Selection` if that is what was handed over, else null. */
export function asSelection(value: unknown): Selection | null {
  if (typeof value === 'object' && value !== null && 'getRangeAt' in value) {
    return value as Selection;
  }
  return null;
}

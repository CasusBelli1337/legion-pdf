/**
 * What the right-click menu on a page thumbnail offers, and the counts the rail
 * reads back. Pure and config-driven: an entry is a label plus an action name,
 * so the menu component stays about pixels, the copy is testable on its own,
 * and a new item is a new entry rather than a new branch.
 *
 * Every label says how many pages it is about, because the menu can be opened
 * on a selection the attorney made a scroll ago.
 */

export type RailMenuAction =
  'go-to' | 'delete' | 'extract' | 'extract-remove' | 'rotate-cw' | 'rotate-ccw' | 'select-all';

export interface RailMenuEntry {
  id: RailMenuAction;
  label: string;
  disabled: boolean;
}

/** "this page" / "3 pages" — reads naturally inside every label below. */
export function countPhrase(count: number): string {
  return count === 1 ? 'this page' : `${count} pages`;
}

/** The rail header's page count: "1 page", "65 pages". */
export function pageCountLabel(pageCount: number): string {
  return `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
}

/** The rail header's selection readout. */
export function selectedLabel(count: number): string {
  return `${count} selected`;
}

export interface RailMenuInput {
  /** The page under the pointer, named in "Go to page 4". */
  page: number;
  /** Everything the menu will act on, in document order. */
  selected: readonly number[];
  pageCount: number;
  /** An operation is already running; nothing may start a second one. */
  busy: boolean;
}

export function railMenuEntries({
  page,
  selected,
  pageCount,
  busy,
}: RailMenuInput): RailMenuEntry[] {
  const count = selected.length;
  const phrase = countPhrase(count);
  const them = count === 1 ? 'it' : 'them';
  const blocked = busy || count === 0;
  const single: RailMenuEntry[] =
    count <= 1 ? [{ id: 'go-to', label: `Go to page ${page}`, disabled: false }] : [];

  return [
    ...single,
    { id: 'delete', label: `Delete ${phrase}`, disabled: blocked },
    { id: 'extract', label: `Extract ${phrase} to a new PDF`, disabled: blocked },
    { id: 'extract-remove', label: `Extract ${phrase} and remove ${them}`, disabled: blocked },
    { id: 'rotate-cw', label: `Rotate ${phrase} clockwise`, disabled: blocked },
    { id: 'rotate-ccw', label: `Rotate ${phrase} counter-clockwise`, disabled: blocked },
    { id: 'select-all', label: 'Select all pages', disabled: busy || count === pageCount },
  ];
}

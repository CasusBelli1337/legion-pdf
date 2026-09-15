/**
 * The pending combine list, as pure arithmetic: what one row is, how a row is
 * described, and where a row lands when it is dragged or nudged.
 *
 * Kept away from the panel because the off-by-one in "drop this row BEFORE
 * that one" is exactly the kind of thing that silently reorders an exhibit set,
 * and it deserves tests rather than a careful read.
 */

import {
  IMAGE_EXTENSIONS,
  PRESENTATION_EXTENSIONS,
  SPREADSHEET_EXTENSIONS,
  TEXT_EXTENSIONS,
  WORD_EXTENSIONS,
  extensionOf,
} from '@shared/convert-inputs';
import type { DocumentSession, MergeSource } from '@shared/types';

export interface CombineEntry {
  /** Identity AND React key: one file path, or one open document's id. */
  key: string;
  /** The file name, as the attorney knows it. */
  label: string;
  /** Plain-English type badge: PDF, Word, Image... */
  kind: string;
  /** Pages, when they are already known (an open tab). Null for a file on disk. */
  pageCount: number | null;
  source: MergeSource;
}

/** Config over code: a new input type is a new row here. */
const KINDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['PDF', ['.pdf']],
  ['Word', WORD_EXTENSIONS],
  ['Excel', SPREADSHEET_EXTENSIONS],
  ['PowerPoint', PRESENTATION_EXTENSIONS],
  ['Text', TEXT_EXTENSIONS],
  ['Image', IMAGE_EXTENSIONS],
];

export function kindOf(fileName: string): string {
  const extension = extensionOf(fileName);
  return KINDS.find(([, extensions]) => extensions.includes(extension))?.[0] ?? 'File';
}

export function fileNameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function entryForPath(filePath: string): CombineEntry {
  const label = fileNameOf(filePath);
  return {
    key: `file:${filePath}`,
    label,
    kind: kindOf(label),
    // Counting pages would mean reading the whole file off disk for a number
    // the combine itself is about to report. The receipt carries the truth.
    pageCount: null,
    source: { filePath },
  };
}

export function entryForSession(session: DocumentSession): CombineEntry {
  return {
    key: `doc:${session.id}`,
    label: session.fileName,
    kind: kindOf(session.fileName),
    pageCount: session.pageCount,
    source: { docId: session.id },
  };
}

/** The additions not already listed — a file combined with itself is a bug. */
export function newEntries(
  entries: readonly CombineEntry[],
  additions: readonly CombineEntry[]
): CombineEntry[] {
  const seen = new Set(entries.map((entry) => entry.key));
  const fresh: CombineEntry[] = [];
  for (const addition of additions) {
    if (seen.has(addition.key)) continue;
    seen.add(addition.key);
    fresh.push(addition);
  }
  return fresh;
}

/** One step up or down. At either end, nothing moves. */
export function moveBy<T>(entries: readonly T[], index: number, direction: -1 | 1): T[] {
  return moveTo(entries, index, index + direction);
}

/**
 * A drag: the row at `from` ends up immediately BEFORE whatever is at
 * `beforeIndex` right now (so `beforeIndex === entries.length` means the end).
 * The row leaves the list before it is put back, which is where the off-by-one
 * lives: every index after `from` has shifted down by one by then.
 */
export function moveBefore<T>(entries: readonly T[], from: number, beforeIndex: number): T[] {
  return moveTo(entries, from, beforeIndex > from ? beforeIndex - 1 : beforeIndex);
}

function moveTo<T>(entries: readonly T[], from: number, to: number): T[] {
  const next = [...entries];
  if (from < 0 || from >= entries.length || to < 0 || to >= entries.length || to === from) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * What the exported files are called, and the promise that none of them lands
 * on top of something that was already there.
 *
 * Per-page exports write a whole BATCH of files that the save dialog never saw,
 * so nothing asked the attorney about overwriting them. The rule here: if any
 * name in the batch is taken, the WHOLE batch moves to a suffixed stem —
 * "Ashford Deposition (2)-page-001.png" — and the receipt says so. A batch that
 * is half old files and half new ones is the outcome nobody could untangle.
 *
 * Single-file exports go the other way: the native save dialog already asked
 * about replacing that exact file, so the answer is honoured.
 */

import { basename, extname, join } from 'node:path';

/** Litigation numbers pages PAGE001, never PAGE1 — three digits is the floor. */
const MIN_DIGITS = 3;
/** Past this many "(n)" tries the folder is the problem, not the name. */
const MAX_ATTEMPTS = 50;

export interface BatchNames {
  /** Absolute paths, one per page, in page order. */
  files: string[];
  /** Plain-English remark when the batch had to be renamed, else null. */
  note: string | null;
}

/** "Ashford Deposition.pdf" → "Ashford Deposition". */
export function fileStem(fileName: string): string {
  return basename(fileName, extname(fileName));
}

export function padWidth(pageCount: number): number {
  return Math.max(MIN_DIGITS, String(pageCount).length);
}

export function pageFileName(
  stem: string,
  page: number,
  digits: number,
  extension: string
): string {
  return `${stem}-page-${String(page).padStart(digits, '0')}.${extension}`;
}

async function anyExists(
  files: readonly string[],
  exists: (path: string) => Promise<boolean>
): Promise<boolean> {
  for (const file of files) {
    if (await exists(file)) return true;
  }
  return false;
}

export interface BatchRequest {
  folder: string;
  stem: string;
  pages: readonly number[];
  extension: string;
  /** The document's full length — what the zero-padding is sized against. */
  pageCount: number;
}

/** Reserves a full set of page names that are all free, or throws saying why. */
export async function claimPageFiles(
  request: BatchRequest,
  exists: (path: string) => Promise<boolean>
): Promise<BatchNames> {
  const digits = padWidth(request.pageCount);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const stem = attempt === 1 ? request.stem : `${request.stem} (${attempt})`;
    const files = request.pages.map((page) =>
      join(request.folder, pageFileName(stem, page, digits, request.extension))
    );
    if (!(await anyExists(files, exists))) {
      const note =
        attempt === 1
          ? null
          : `Images named "${request.stem}-page-..." were already in that folder, so this set ` +
            `was saved as "${stem}-page-...".`;
      return { files, note };
    }
  }
  throw new Error(
    `That folder already holds ${MAX_ATTEMPTS} sets of images named after ` +
      `"${request.stem}". Choose a different folder.`
  );
}

/**
 * Rebuilding a document from a subset of its pages.
 *
 * Why rebuild instead of `removePage`: pdf-lib's writer serializes every object
 * still in the context, so a page detached from the page tree keeps its content
 * stream in the saved file. A deleted privileged page that is still readable in
 * the bytes is exactly the failure this app exists to prevent, so delete,
 * extract, and split all copy the SURVIVING pages into a fresh document —
 * pdf-lib's copier only follows what those pages actually reference.
 */

import type { PDFDocument } from 'pdf-lib';
import type { BookmarkNode } from '@shared/types';
import { readOutline } from './bookmarks-read';
import { writeOutline } from './bookmarks-write';
import { createPdf, type ProgressReporter } from './pdf-io';
import { toZeroBased } from './page-selection';

/**
 * Re-points an outline at a new page order. Bookmarks whose page did not
 * survive are dropped and their children promoted, so a subtree is never lost
 * because its heading page went away.
 */
export function remapBookmarks(
  tree: readonly BookmarkNode[],
  pageMap: ReadonlyMap<number, number>
): BookmarkNode[] {
  const remapped: BookmarkNode[] = [];
  for (const node of tree) {
    const children = remapBookmarks(node.children, pageMap);
    const page = pageMap.get(node.page);
    if (page === undefined) {
      remapped.push(...children);
      continue;
    }
    remapped.push({ title: node.title, page, children });
  }
  return remapped;
}

/** old 1-based page → new 1-based position, first occurrence wins. */
function pageMapFor(pages: readonly number[]): Map<number, number> {
  const map = new Map<number, number>();
  pages.forEach((page, index) => {
    if (!map.has(page)) map.set(page, index + 1);
  });
  return map;
}

/**
 * A new document holding `pages` (1-based, in the given order) with rotations,
 * annotations, and a remapped outline carried over.
 */
export async function rebuildFromPages(
  source: PDFDocument,
  pages: readonly number[],
  onProgress?: ProgressReporter
): Promise<PDFDocument> {
  if (pages.length === 0) {
    throw new Error('Rebuilding was asked for zero pages — refusing to write an empty document.');
  }
  const rebuilt = await createPdf();
  const copied = await rebuilt.copyPages(source, toZeroBased(pages));
  copied.forEach((page, index) => {
    rebuilt.addPage(page);
    onProgress?.(index + 1, pages.length);
  });
  if (rebuilt.getPageCount() !== pages.length) {
    throw new Error(
      `Rebuilding produced ${rebuilt.getPageCount()} pages instead of ${pages.length}.`
    );
  }
  writeOutline(rebuilt, remapBookmarks(readOutline(source), pageMapFor(pages)));
  return rebuilt;
}

/**
 * The two bookmark operations the IPC layer calls: read the outline tree, and
 * replace it. Reading and writing the raw /Outlines dictionaries lives in
 * bookmarks-read.ts and bookmarks-write.ts.
 */

import type { BookmarkNode, OpResult } from '@shared/types';
import { readOutline } from './bookmarks-read';
import { writeOutline } from './bookmarks-write';
import { finish, loadPdf } from './pdf-io';

/** The document's outline, or an empty array when it has no bookmarks. */
export async function getBookmarks(bytes: Uint8Array): Promise<BookmarkNode[]> {
  const document = await loadPdf(bytes);
  return readOutline(document);
}

/**
 * Replaces the whole outline. An empty tree removes every bookmark — that is a
 * real instruction, not a collapsed window, so it is allowed.
 */
export async function setBookmarks(
  bytes: Uint8Array,
  tree: readonly BookmarkNode[]
): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  writeOutline(document, tree);
  return finish(document, pagesIn, pagesIn, undefined, 'document with new bookmarks');
}

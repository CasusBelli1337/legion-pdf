/**
 * Combine several PDFs into one, in the order the user arranged them.
 * Each file's own outline is nested under a top-level bookmark named after the
 * file, and page rotations ride along with the copied pages (F-2 acceptance).
 */

import type { BookmarkNode, MergeDetail, OpResult } from '@shared/types';
import { readOutline } from './bookmarks-read';
import { writeOutline } from './bookmarks-write';
import { createPdf, finish, loadPdf, type ProgressReporter } from './pdf-io';

/** One input file, already read into memory by the caller (core does no file IO). */
export interface MergeSourceDocument {
  /** Shown to the user and used as the top-level bookmark title. */
  name: string;
  bytes: Uint8Array;
}

export interface MergeSettings {
  preserveBookmarks: boolean;
}

function bookmarkTitle(name: string): string {
  const trimmed = name.trim().replace(/\.pdf$/i, '');
  return trimmed.length > 0 ? trimmed : 'Untitled document';
}

function shiftPages(tree: readonly BookmarkNode[], offset: number): BookmarkNode[] {
  return tree.map((node) => ({
    title: node.title,
    page: node.page + offset,
    children: shiftPages(node.children, offset),
  }));
}

/**
 * Combines `sources` head to tail. Throws before writing anything if the list
 * is empty or a file will not open — never returns a one-page "success".
 */
export async function mergeDocuments(
  sources: readonly MergeSourceDocument[],
  settings: MergeSettings,
  onProgress?: ProgressReporter
): Promise<OpResult<MergeDetail>> {
  if (sources.length === 0) {
    throw new RangeError('Combining needs at least one file — nothing was selected.');
  }
  const loaded = await Promise.all(
    sources.map(async (source) => {
      const document = await loadPdf(source.bytes, `file "${source.name}"`);
      return { name: source.name, document, pageCount: document.getPageCount() };
    })
  );

  const totalPages = loaded.reduce((total, source) => total + source.pageCount, 0);
  const merged = await createPdf();
  const perSourcePages: number[] = [];
  const outline: BookmarkNode[] = [];

  for (const source of loaded) {
    const offset = merged.getPageCount();
    const pages = await merged.copyPages(source.document, source.document.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    perSourcePages.push(source.pageCount);
    outline.push({
      title: bookmarkTitle(source.name),
      page: offset + 1,
      children: shiftPages(readOutline(source.document), offset),
    });
    onProgress?.(merged.getPageCount(), totalPages);
  }

  if (settings.preserveBookmarks) writeOutline(merged, outline);
  return finish(merged, totalPages, totalPages, { perSourcePages }, 'combined document');
}

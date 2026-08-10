/**
 * One function per Organize Pages action. Each calls the typed bridge and
 * returns the sentence the panel shows afterwards, so every button reports what
 * actually happened ("Removed 2 pages. 10 pages left.") instead of going quiet.
 */

import type { MergeSource } from '@shared/types';
import { openNewDocuments } from './new-documents';

function pageWord(count: number): string {
  return count === 1 ? 'page' : 'pages';
}

export async function rotatePages(
  docId: string,
  pages: number[],
  direction: 'clockwise' | 'counter-clockwise'
): Promise<string> {
  const degrees = direction === 'clockwise' ? 90 : 270;
  await window.librarius.ops.rotate(docId, { pages, degrees });
  return `Turned ${pages.length} ${pageWord(pages.length)} ${direction}.`;
}

export async function deletePages(docId: string, pages: number[]): Promise<string> {
  const result = await window.librarius.ops.delete(docId, { pages });
  return `Removed ${pages.length} ${pageWord(pages.length)}. ${result.pagesOut} left.`;
}

export async function extractPages(
  docId: string,
  pages: number[],
  removeFromSource: boolean
): Promise<string> {
  const result = await window.librarius.ops.extract(docId, { pages, removeFromSource });
  await openNewDocuments([result.detail.docId]);
  const tail = removeFromSource ? ' They were removed from this document.' : '';
  return `Pulled ${result.pagesOut} ${pageWord(result.pagesOut)} into a new tab.${tail}`;
}

export async function insertBlankPage(docId: string, atPage: number): Promise<string> {
  const result = await window.librarius.ops.insertBlank(docId, { atPage, count: 1 });
  return `Added a blank page at page ${atPage}. The document now has ${result.pagesOut} pages.`;
}

export async function insertPagesFromFile(
  docId: string,
  atPage: number,
  sourceFilePath: string
): Promise<string> {
  const result = await window.librarius.ops.insertFrom(docId, { atPage, sourceFilePath });
  const added = result.pagesOut - result.pagesIn;
  return `Inserted ${added} ${pageWord(added)} at page ${atPage}.`;
}

export async function reorderPages(docId: string, order: number[]): Promise<string> {
  await window.librarius.ops.reorder(docId, { order });
  return 'Pages rearranged.';
}

export async function splitDocument(docId: string, ranges: string[]): Promise<string> {
  const result = await window.librarius.ops.split(docId, { ranges });
  await openNewDocuments(result.detail.partDocIds);
  const parts = result.detail.partDocIds.length;
  return `Split into ${parts} ${parts === 1 ? 'document' : 'documents'}, each in its own tab.`;
}

export async function combineDocuments(sources: MergeSource[]): Promise<string> {
  const result = await window.librarius.ops.merge({ sources, preserveBookmarks: true });
  await openNewDocuments([result.detail.docId]);
  return `Combined ${sources.length} files into one ${result.pagesOut}-page document in a new tab.`;
}

export async function scrubForProduction(docId: string): Promise<string> {
  const result = await window.librarius.ops.scrubMetadata(docId, {
    clearInfoDict: true,
    clearXmp: true,
    removeAttachments: false,
  });
  const cleared = result.detail.clearedFields.length;
  const found = result.detail.attachmentsFound;
  const warning =
    found > 0
      ? ` Warning: this file still carries ${found} embedded ${found === 1 ? 'attachment' : 'attachments'}.`
      : '';
  return `Removed ${cleared} hidden ${cleared === 1 ? 'item' : 'items'} of document information.${warning}`;
}

export async function flattenDocument(docId: string): Promise<string> {
  const result = await window.librarius.ops.flatten(docId, {});
  const count = result.detail.annotationsFlattened;
  return count === 0
    ? 'There was nothing left to flatten — this document has no annotations.'
    : `Flattened ${count} ${count === 1 ? 'annotation' : 'annotations'} into the pages.`;
}

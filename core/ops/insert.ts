/**
 * Insert blank pages, or pages taken from another PDF, at a position.
 * Both work in place so everything already in the document survives; the blank
 * page copies the size of the page it lands next to, including the swap a
 * rotated (landscape) neighbour implies.
 */

import type { InsertBlankOptions, OpResult, PageSize } from '@shared/types';
import { normalizePages } from './page-selection';
import { finish, loadPdf, type ProgressReporter } from './pdf-io';

const MAX_BLANK_PAGES = 500;

/** Options as core sees them: the caller has already read the file off disk. */
export interface InsertFromSettings {
  atPage: number;
  sourceBytes: Uint8Array;
  /** Omit to insert every page of the source. */
  sourcePages?: number[];
}

function assertInsertPosition(atPage: number, pageCount: number): number {
  if (!Number.isInteger(atPage) || atPage < 1 || atPage > pageCount + 1) {
    throw new RangeError(
      `Pages can go in at positions 1 through ${pageCount + 1} of this document, not ${atPage}.`
    );
  }
  return atPage - 1;
}

function neighbourSize(sizes: readonly PageSize[], index: number): PageSize {
  const neighbour = sizes[index] ?? sizes[sizes.length - 1];
  if (neighbour === undefined) throw new Error('The document has no page to match the size of.');
  return neighbour;
}

/** MediaBox is stored unrotated; a 90°/270° page LOOKS like its size swapped. */
function visualSizes(pageCount: number, read: (index: number) => PageSize & { angle: number }) {
  const sizes: PageSize[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const { width, height, angle } = read(index);
    const quarterTurned = Math.abs(Math.round(angle / 90)) % 2 === 1;
    sizes.push(quarterTurned ? { width: height, height: width } : { width, height });
  }
  return sizes;
}

export async function insertBlankPages(
  bytes: Uint8Array,
  options: InsertBlankOptions
): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const index = assertInsertPosition(options.atPage, pagesIn);
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > MAX_BLANK_PAGES) {
    throw new RangeError(
      `Insert between 1 and ${MAX_BLANK_PAGES} blank pages, not ${options.count}.`
    );
  }

  const sizes = visualSizes(pagesIn, (position) => {
    const page = document.getPage(position);
    return { ...page.getSize(), angle: page.getRotation().angle };
  });
  const size = options.size ?? neighbourSize(sizes, index);

  for (let added = 0; added < options.count; added += 1) {
    document.insertPage(index + added, [size.width, size.height]);
  }
  return finish(document, pagesIn, pagesIn + options.count, undefined, 'document with blank pages');
}

export async function insertPagesFrom(
  bytes: Uint8Array,
  settings: InsertFromSettings,
  onProgress?: ProgressReporter
): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const source = await loadPdf(settings.sourceBytes, 'file being inserted');
  const pagesIn = document.getPageCount();
  const index = assertInsertPosition(settings.atPage, pagesIn);

  const sourceCount = source.getPageCount();
  const wanted =
    settings.sourcePages === undefined
      ? source.getPageIndices().map((zeroBased) => zeroBased + 1)
      : normalizePages(settings.sourcePages, sourceCount, 'pages to insert');

  const copied = await document.copyPages(
    source,
    wanted.map((page) => page - 1)
  );
  copied.forEach((page, offset) => {
    document.insertPage(index + offset, page);
    onProgress?.(offset + 1, copied.length);
  });

  return finish(document, pagesIn, pagesIn + wanted.length, undefined, 'document with new pages');
}

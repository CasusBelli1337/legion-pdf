/**
 * Reorder pages to a complete permutation (what a thumbnail drag produces).
 *
 * Done in place — the same page objects are detached and re-inserted — so form
 * fields, named destinations, and outline destinations keep pointing at the
 * pages they always pointed at. Nothing is dropped, so nothing can be left
 * behind in the file either.
 */

import type { OpResult, ReorderOptions } from '@shared/types';
import { assertPermutation } from './page-selection';
import { finish, loadPdf, type ProgressReporter } from './pdf-io';

export async function reorderPages(
  bytes: Uint8Array,
  options: ReorderOptions,
  onProgress?: ProgressReporter
): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const order = assertPermutation(options.order, pagesIn);

  const pages = document.getPages();
  for (let index = pagesIn - 1; index >= 0; index -= 1) document.removePage(index);

  order.forEach((sourcePage, index) => {
    const page = pages[sourcePage - 1];
    if (page === undefined) {
      throw new RangeError(`Page ${sourcePage} vanished while reordering — nothing was saved.`);
    }
    document.insertPage(index, page);
    onProgress?.(index + 1, pagesIn);
  });

  return finish(document, pagesIn, pagesIn, undefined, 'reordered document');
}

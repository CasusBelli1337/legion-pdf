/**
 * Delete pages. The document is REBUILT from the surviving pages rather than
 * detaching leaves from the page tree, so the deleted page's content leaves the
 * file with it (see the note in rebuild.ts). Deleting every page is refused.
 */

import type { DeletePagesOptions, OpResult } from '@shared/types';
import { normalizePages, survivingPages } from './page-selection';
import { finish, loadPdf, type ProgressReporter } from './pdf-io';
import { rebuildFromPages } from './rebuild';

export async function deletePages(
  bytes: Uint8Array,
  options: DeletePagesOptions,
  onProgress?: ProgressReporter
): Promise<OpResult> {
  const source = await loadPdf(bytes);
  const pagesIn = source.getPageCount();
  const removed = normalizePages(options.pages, pagesIn, 'pages to delete');
  const survivors = survivingPages(removed, pagesIn);

  const rebuilt = await rebuildFromPages(source, survivors, onProgress);
  return finish(rebuilt, pagesIn, survivors.length, undefined, 'trimmed document');
}

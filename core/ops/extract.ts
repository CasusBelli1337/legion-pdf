/**
 * Pull a selection of pages into a new document, optionally removing them from
 * the source. `bytes` is the EXTRACTED document; the source (changed only when
 * `removeFromSource` is set) rides along in `detail` so the caller can swap the
 * store's copy in one step.
 */

import type { ExtractOptions, ExtractPagesDetail, OpResult } from '@shared/types';
import { countPages } from '../pdf-meta';
import { normalizePages, survivingPages } from './page-selection';
import { loadPdf, savePdf, sealResult, type ProgressReporter } from './pdf-io';
import { rebuildFromPages } from './rebuild';

export async function extractPages(
  bytes: Uint8Array,
  options: ExtractOptions,
  onProgress?: ProgressReporter
): Promise<OpResult<ExtractPagesDetail>> {
  const source = await loadPdf(bytes);
  const pagesIn = source.getPageCount();
  const pages = normalizePages(options.pages, pagesIn, 'page selection');

  const extracted = await rebuildFromPages(source, pages, onProgress);
  const extractedBytes = await savePdf(extracted, 'extracted document');

  const detail: ExtractPagesDetail = {
    sourceBytes: bytes,
    sourcePageCount: pagesIn,
    extractedPages: pages,
  };

  if (options.removeFromSource) {
    const survivors = survivingPages(pages, pagesIn);
    const remainder = await rebuildFromPages(source, survivors);
    detail.sourceBytes = await savePdf(remainder, 'remaining document');
    detail.sourcePageCount = await countPages(detail.sourceBytes);
    if (detail.sourcePageCount !== survivors.length) {
      throw new Error(
        `The source came out with ${detail.sourcePageCount} pages instead of ${survivors.length}.`
      );
    }
  }

  return sealResult(extractedBytes, pagesIn, pages.length, detail, 'extracted document');
}

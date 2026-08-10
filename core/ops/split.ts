/**
 * Split one document into several by page range. Non-destructive: the returned
 * `bytes` are the untouched source and the new documents live in `detail.parts`,
 * matching the IPC contract for `ops:split`.
 *
 * `pagesOut` is the TOTAL pages written across all parts, which can exceed
 * `pagesIn` when ranges overlap. Every part is re-opened and counted before the
 * result is handed back.
 */

import { RangeCollapseError } from '@shared/types';
import type { OpResult, SplitDetail } from '@shared/types';
import { countPages } from '../pdf-meta';
import { parsePageRanges } from './page-selection';
import { loadPdf, savePdf, type ProgressReporter } from './pdf-io';
import { rebuildFromPages } from './rebuild';

export async function splitByRanges(
  bytes: Uint8Array,
  ranges: readonly string[],
  onProgress?: ProgressReporter
): Promise<OpResult<SplitDetail>> {
  const source = await loadPdf(bytes);
  const pagesIn = source.getPageCount();
  if (ranges.length === 0) {
    throw new RangeCollapseError('no ranges given', pagesIn);
  }

  const parts: Uint8Array[] = [];
  const partPageCounts: number[] = [];

  for (const [index, spec] of ranges.entries()) {
    const pages = parsePageRanges(spec, pagesIn);
    const part = await rebuildFromPages(source, pages);
    const partBytes = await savePdf(part, `part ${index + 1} ("${spec}")`);
    const written = await countPages(partBytes);
    if (written !== pages.length) {
      throw new Error(
        `Part ${index + 1} ("${spec}") came out with ${written} pages instead of ${pages.length}.`
      );
    }
    parts.push(partBytes);
    partPageCounts.push(written);
    onProgress?.(index + 1, ranges.length);
  }

  const pagesOut = partPageCounts.reduce((total, count) => total + count, 0);
  if (pagesOut === 0) throw new RangeCollapseError(ranges.join(', '), pagesIn);
  return { bytes, pagesIn, pagesOut, detail: { parts, partPageCounts } };
}

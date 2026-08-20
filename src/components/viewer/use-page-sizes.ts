/**
 * Page sizes, learned in the background. The virtualizer needs a height for
 * every page before it has drawn any of them, and ViewerApi.pageSize() must
 * answer for pages that are nowhere near the viewport, so the sizes are pulled
 * in chunks right after the document opens and cached in the controller.
 *
 * Sizes learned from the PREVIOUS generation of a document are kept while the
 * next one is read. Dropping them meant every edit briefly re-measured the run
 * at US Letter, which jumped every page on screen and then jumped it back; the
 * new chunks overwrite the old numbers as they land, so a rotation still
 * re-measures correctly, just without the lurch.
 */

import { useEffect, useState } from 'react';
import type { PageSize } from '@shared/types';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import type { ViewerController } from './viewer-controller';

const CHUNK = 16;

export interface PageSizeIndex {
  /** A page's size in PDF points, falling back to page 1 until it is known. */
  sizeOf(page: number): PageSize | null;
  /** Steps on every batch of sizes, so the virtualizer knows to re-estimate. */
  version: number;
}

interface SizeState {
  /** 0 until the first batch lands; then one step per batch. */
  version: number;
  sizes: ReadonlyMap<number, PageSize>;
}

const NO_SIZES: SizeState = { version: 0, sizes: new Map() };

async function readChunk(
  document: PDFDocumentProxy,
  first: number,
  last: number
): Promise<Array<[number, PageSize]>> {
  const pages: number[] = [];
  for (let page = first; page <= last; page += 1) pages.push(page);
  return Promise.all(
    pages.map(async (page): Promise<[number, PageSize]> => {
      const pdfPage = await document.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1 });
      return [page, { width: viewport.width, height: viewport.height }];
    })
  );
}

export function usePageSizes(
  document: PDFDocumentProxy | null,
  controller: ViewerController
): PageSizeIndex {
  const [state, setState] = useState<SizeState>(NO_SIZES);

  useEffect(() => {
    if (document === null) return;
    let cancelled = false;

    // Each batch is merged onto whatever is already known, so the sizes learned
    // from the generation an edit just replaced carry the run until the new
    // numbers land on top of them.
    function absorb(chunk: Array<[number, PageSize]>): void {
      setState((current) => {
        const sizes = new Map(current.sizes);
        for (const [page, size] of chunk) sizes.set(page, size);
        return { version: current.version + 1, sizes };
      });
    }

    async function load(pdf: PDFDocumentProxy): Promise<void> {
      for (let first = 1; first <= pdf.numPages; first += CHUNK) {
        if (cancelled) return;
        const chunk = await readChunk(pdf, first, Math.min(first + CHUNK - 1, pdf.numPages));
        if (cancelled) return;
        for (const [page, size] of chunk) controller.setSize(page, size);
        absorb(chunk);
      }
    }

    void load(document).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [controller, document]);

  return {
    version: state.version,
    sizeOf: (page) => state.sizes.get(page) ?? state.sizes.get(1) ?? null,
  };
}

/**
 * Page sizes, learned in the background. The virtualizer needs a height for
 * every page before it has drawn any of them, and ViewerApi.pageSize() must
 * answer for pages that are nowhere near the viewport, so the sizes are pulled
 * in chunks right after the document opens and cached in the controller.
 */

import { useEffect, useState } from 'react';
import type { PageSize } from '@shared/types';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import type { ViewerController } from './viewer-controller';

const CHUNK = 16;

export interface PageSizeIndex {
  /** A page's size in PDF points, falling back to page 1 until it is known. */
  sizeOf(page: number): PageSize | null;
  /** Grows as sizes land, so the virtualizer knows to re-estimate. */
  version: number;
}

interface SizeState {
  document: PDFDocumentProxy | null;
  sizes: ReadonlyMap<number, PageSize>;
}

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
  const [state, setState] = useState<SizeState>({ document: null, sizes: new Map() });

  useEffect(() => {
    if (document === null) return;
    let cancelled = false;

    async function load(pdf: PDFDocumentProxy): Promise<void> {
      const sizes = new Map<number, PageSize>();
      for (let first = 1; first <= pdf.numPages; first += CHUNK) {
        if (cancelled) return;
        const chunk = await readChunk(pdf, first, Math.min(first + CHUNK - 1, pdf.numPages));
        if (cancelled) return;
        for (const [page, size] of chunk) {
          sizes.set(page, size);
          controller.setSize(page, size);
        }
        setState({ document: pdf, sizes: new Map(sizes) });
      }
    }

    void load(document).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [controller, document]);

  const known = state.document === document ? state.sizes : null;
  return {
    version: known?.size ?? 0,
    sizeOf: (page) => known?.get(page) ?? known?.get(1) ?? null,
  };
}

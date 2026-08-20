/**
 * The only file in this lane that knows pdfjs exists. Everything else works on
 * plain numbers, which is what makes the classifier testable without a PDF.
 *
 * INDEXING ASSUMPTION — this must agree with the viewer lane. `data-item-index`
 * on a text-layer span is the index into the array `getTextContent()` returned,
 * counting marked-content entries. pdfjs renders no span for those entries, so
 * they are kept here as empty placeholders rather than filtered out: dropping
 * them would shift every later index by one and mis-role half the page.
 */

import type { PDFDocumentProxy } from '../../lib/pdfjs';
import type { PageItemSource } from './engine';
import type { TextItemLike } from './item-geometry';
import type { PageInput } from './page-classifier';

/** Holds an index that pdfjs did not render a span for. */
const PLACEHOLDER: TextItemLike = { str: '', transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 };

function isTextItem(entry: unknown): entry is TextItemLike {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as TextItemLike).str === 'string' &&
    Array.isArray((entry as TextItemLike).transform)
  );
}

export function toTextItems(items: readonly unknown[]): TextItemLike[] {
  return items.map((entry) =>
    isTextItem(entry)
      ? {
          str: entry.str,
          transform: entry.transform,
          width: typeof entry.width === 'number' ? entry.width : 0,
          height: typeof entry.height === 'number' ? entry.height : 0,
        }
      : PLACEHOLDER
  );
}

/** A page source backed by an open pdfjs document. */
export function createPdfjsSource(document: PDFDocumentProxy, docId: string): PageItemSource {
  return {
    docId,
    pageCount: document.numPages,
    async loadPage(page: number): Promise<PageInput> {
      const pdfPage = await document.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const content = await pdfPage.getTextContent();
      return {
        page,
        items: toTextItems(content.items),
        size: { width: viewport.width, height: viewport.height },
      };
    },
  };
}

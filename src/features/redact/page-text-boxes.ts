/**
 * Positioned text off the rebuilt pages — the only reader in the app that can
 * say WHERE a glyph sits, which is what makes the last gate region-scoped.
 *
 * The boxes come back in PDF user space with the run's baseline as its origin,
 * because that is exactly how the viewer's search builds the quads a mark is
 * made from (components/viewer/text-search.ts). The two are derived from the
 * same pdfjs numbers, so a mark and a text run can be compared directly without
 * re-deriving anything from the screen.
 */

import type { PdfRect } from '@shared/types';
import { loadDocument } from '@renderer/lib/pdfjs';

/** One text run pdfjs could read, and where it sits. */
export interface TextBox {
  text: string;
  rect: PdfRect;
}

export interface PageTextBoxes {
  /** 1-based page number. */
  page: number;
  /** Every run the page yields. Empty means the page is a picture. */
  boxes: TextBox[];
}

/** The slice of a pdfjs text item this needs. Marked-content markers have no `str`. */
interface PositionedItem {
  str: string;
  transform: readonly number[];
  width: number;
  height: number;
}

function isPositioned(item: unknown): item is PositionedItem {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as { str?: unknown; transform?: unknown };
  return typeof candidate.str === 'string' && Array.isArray(candidate.transform);
}

/** A run's box in PDF user space; `(e, f)` of the text matrix is its baseline. */
export function itemRect(item: PositionedItem): PdfRect {
  const [, , , , e = 0, f = 0] = item.transform;
  return {
    x: e,
    y: f,
    width: Math.max(item.width, 0.01),
    height: Math.max(item.height, 1),
  };
}

function boxesOfContent(items: readonly unknown[]): TextBox[] {
  const boxes: TextBox[] = [];
  for (const item of items) {
    if (!isPositioned(item)) continue;
    boxes.push({ text: item.str, rect: itemRect(item) });
  }
  return boxes;
}

function assertPagesExist(pages: readonly number[], pageCount: number): void {
  for (const page of pages) {
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new RangeError(
        `Cannot read page ${page}: the redacted document has pages 1 through ${pageCount}.`
      );
    }
  }
}

/**
 * Read every text run on the named pages. A page that yields nothing comes back
 * with an empty list rather than being dropped — the caller counts pages, and a
 * page silently missing from the answer would read as a page that was checked.
 */
export async function readPageTextBoxes(
  bytes: Uint8Array,
  pages: readonly number[]
): Promise<PageTextBoxes[]> {
  const document = await loadDocument(bytes);
  try {
    assertPagesExist(pages, document.numPages);
    const read: PageTextBoxes[] = [];
    for (const page of pages) {
      const content = await document.getPage(page).then((proxy) => proxy.getTextContent());
      read.push({ page, boxes: boxesOfContent(content.items) });
    }
    return read;
  } finally {
    // pdfjs 6 tears the worker down through the loading task, not the proxy.
    await document.loadingTask.destroy();
  }
}

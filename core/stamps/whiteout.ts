/**
 * F-10 whiteout. A filled rectangle painted over a region of the page, and —
 * when `removeCoveredText` is set — the deletion of the text operators the
 * rectangle covers, which is what makes "cover it and type over it" honest.
 *
 * Painting alone is COVER, not destruction: the words underneath still copy
 * out, still feed an AI prompt, still extract for an opponent. With removal on,
 * the covered characters stop existing on the page (core/edit proves it before
 * returning). It is still not redaction (F-8): redaction rebuilds the page from
 * a raster because a scan carries its words as pixels, and only that can defeat
 * an image. The panel says so in as many words.
 */

import type { OpResult, PdfRect, WhiteoutOptions } from '@shared/types';
import { removeTextInRect } from '@core/edit';
import { finish, loadPdf } from '../ops/pdf-io';
import { parseHexColor, WHITE } from './color';
import { toVisualSpace } from './geometry';
import { drawRect, pageFrame } from './ink';

/** Bottom-left and size of a rect, whichever way round it was dragged out. */
function normalizeRect(rect: PdfRect): PdfRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function assertOptions(options: WhiteoutOptions, rect: PdfRect, pageCount: number): void {
  if (!Number.isInteger(options.page) || options.page < 1 || options.page > pageCount) {
    throw new RangeError(
      `This document has pages 1 through ${pageCount}; there is no page ${options.page}.`
    );
  }
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new RangeError(
      'Drag out an area to cover — a box with no width or height covers nothing.'
    );
  }
}

export async function applyWhiteout(
  bytes: Uint8Array,
  options: WhiteoutOptions
): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const rect = normalizeRect(options.rect);
  assertOptions(options, rect, pagesIn);

  // Removal first, painting second: the rectangle pdf-lib draws goes into a
  // content stream of its own, and rewriting the page's originals afterwards
  // would have to reason about ink that was not there when the glyphs were read.
  if (options.removeCoveredText === true) {
    await removeTextInRect(document, { page: options.page, rect });
  }

  const page = document.getPage(options.page - 1);
  const frame = pageFrame(page);
  const corner = toVisualSpace(frame, { x: rect.x, y: rect.y });
  const opposite = toVisualSpace(frame, { x: rect.x + rect.width, y: rect.y + rect.height });

  drawRect(page, frame, {
    at: { x: Math.min(corner.x, opposite.x), y: Math.min(corner.y, opposite.y) },
    size: {
      width: Math.abs(opposite.x - corner.x),
      height: Math.abs(opposite.y - corner.y),
    },
    fill: options.color === undefined ? WHITE : parseHexColor(options.color, 'cover colour'),
  });

  return finish(document, pagesIn, pagesIn, undefined, 'document with a covered area');
}

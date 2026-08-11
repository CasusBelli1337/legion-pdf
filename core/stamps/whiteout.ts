/**
 * F-10 whiteout. A filled rectangle painted over a region of the page — the
 * pragmatic ninety percent of "edit the text", paired with the text box to
 * retype over it.
 *
 * This is COVER, not destruction: whatever is underneath is still in the file
 * and still extracts. Anything that must actually be gone goes through
 * redaction (F-8), which rebuilds the page from a raster. The panel says so in
 * as many words, because the difference is the whole ballgame in a production.
 */

import type { OpResult, PdfRect, WhiteoutOptions } from '@shared/types';
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

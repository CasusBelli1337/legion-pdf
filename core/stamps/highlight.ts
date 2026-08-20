/**
 * Translucent highlighting — the marker pen an attorney reaches for while
 * reading, not a redaction.
 *
 * Two things make it a highlighter rather than a coloured box over the words:
 * the fill is a real transparency (an /ExtGState `ca`, the same machinery the
 * watermark uses) and it is composited in MULTIPLY, so black text under yellow
 * comes out black rather than veiled. The text itself is never touched — it
 * stays exactly where it was and still extracts, which is the whole difference
 * between this and redaction (F-8), where the text must actually be gone.
 *
 * Like every other stamp the fill goes into the page content stream, so it is
 * not an annotation another reader will offer to delete.
 */

import { BlendMode } from 'pdf-lib';
import type { HighlightOptions, OpResult, PdfRect } from '@shared/types';
import { finish, loadPdf } from '../ops/pdf-io';
import { parseHexColor } from './color';
import { toVisualSpace, type PageFrame } from './geometry';
import { drawRect, pageFrame } from './ink';

/** The colour of every highlighter pen ever left in a deposition binder. */
export const HIGHLIGHT_YELLOW = '#FFEB3B';
/** Strong enough to see across a page, light enough to read the text through. */
const HIGHLIGHT_OPACITY = 0.5;

/** Bottom-left and size of a rect, whichever way round it was dragged out. */
function normalizeRect(rect: PdfRect): PdfRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function assertOptions(
  options: HighlightOptions,
  rects: readonly PdfRect[],
  pageCount: number
): void {
  if (!Number.isInteger(options.page) || options.page < 1 || options.page > pageCount) {
    throw new RangeError(
      `This document has pages 1 through ${pageCount}; there is no page ${options.page}.`
    );
  }
  if (rects.length === 0) {
    throw new RangeError('Drag over the words to highlight — nothing was selected.');
  }
  const empty = rects.findIndex((rect) => !(rect.width > 0) || !(rect.height > 0));
  if (empty !== -1) {
    throw new RangeError(
      `Highlight area ${empty + 1} has no width or height, so it would mark nothing.`
    );
  }
}

/** One user-space rect as the box to paint on the displayed page. */
function visualBox(frame: PageFrame, rect: PdfRect) {
  const corner = toVisualSpace(frame, { x: rect.x, y: rect.y });
  const opposite = toVisualSpace(frame, { x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    at: { x: Math.min(corner.x, opposite.x), y: Math.min(corner.y, opposite.y) },
    size: { width: Math.abs(opposite.x - corner.x), height: Math.abs(opposite.y - corner.y) },
  };
}

export async function applyHighlight(
  bytes: Uint8Array,
  options: HighlightOptions
): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const rects = options.rects.map(normalizeRect);
  assertOptions(options, rects, pagesIn);

  const page = document.getPage(options.page - 1);
  const frame = pageFrame(page);
  const fill = parseHexColor(options.color ?? HIGHLIGHT_YELLOW, 'highlight colour');

  let painted = 0;
  for (const rect of rects) {
    const box = visualBox(frame, rect);
    if (!(box.size.width > 0) || !(box.size.height > 0)) continue;
    drawRect(page, frame, {
      ...box,
      fill,
      opacity: HIGHLIGHT_OPACITY,
      blendMode: BlendMode.Multiply,
    });
    painted += 1;
  }

  // A highlight that quietly marked fewer boxes than it was handed would look
  // exactly like one that marked them all. Count, and refuse to report success.
  if (painted !== rects.length) {
    throw new Error(
      `Only ${painted} of ${rects.length} highlight areas could be drawn — nothing was saved.`
    );
  }

  return finish(document, pagesIn, pagesIn, undefined, 'highlighted document');
}

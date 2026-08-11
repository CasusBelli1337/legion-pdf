/**
 * The arithmetic behind a redaction mark: drawing one, moving one, resizing
 * one, and turning a search hit into one. Pure PDF user-space geometry, no
 * React and no DOM, so every number the attorney's marks depend on is unit
 * tested rather than eyeballed on screen.
 *
 * The padding constant is the important one. Search quads come from pdfjs text
 * items, whose widths are proportional-font ESTIMATES — reliably a hair short.
 * A mark that is a hair short leaves the tail of a descender or the edge of a
 * digit legible at 300 DPI, so every search-derived mark is grown on all four
 * sides before it is ever burned.
 */

import type { PdfPoint, PdfRect, RedactionBox, TextMatch } from '@shared/types';

/** Points added on every side of a search quad. Two points ≈ 8 pixels at 300 DPI. */
export const QUAD_PADDING_PT = 2;

/** Below this a drag is a click, not a box. */
export const MIN_MARK_PT = 3;

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'ne', 'sw', 'se'];

/** A rectangle from two dragged corners, whichever way the drag went. */
export function rectFromCorners(from: PdfPoint, to: PdfPoint): PdfRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/** Grow a rectangle on all four sides. Never returns a negative dimension. */
export function padRect(rect: PdfRect, padding: number = QUAD_PADDING_PT): PdfRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: Math.max(0, rect.width + padding * 2),
    height: Math.max(0, rect.height + padding * 2),
  };
}

/** True when a dragged rectangle is big enough to be worth destroying. */
export function isDrawable(rect: PdfRect): boolean {
  return rect.width >= MIN_MARK_PT && rect.height >= MIN_MARK_PT;
}

/** Slide a mark by a delta in points. */
export function moveRect(rect: PdfRect, dx: number, dy: number): PdfRect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}

/** The fixed corner a handle drags away from, in PDF space (y grows upward). */
function anchorOf(rect: PdfRect, handle: ResizeHandle): PdfPoint {
  const left = rect.x;
  const right = rect.x + rect.width;
  const bottom = rect.y;
  const top = rect.y + rect.height;
  const anchors: Record<ResizeHandle, PdfPoint> = {
    nw: { x: right, y: bottom },
    ne: { x: left, y: bottom },
    sw: { x: right, y: top },
    se: { x: left, y: top },
  };
  return anchors[handle];
}

/** Resize by dragging one corner; the opposite corner stays put. */
export function resizeRect(rect: PdfRect, handle: ResizeHandle, to: PdfPoint): PdfRect {
  return rectFromCorners(anchorOf(rect, handle), to);
}

/** True when a point is inside a mark, with an optional grab tolerance. */
export function hitTest(rect: PdfRect, point: PdfPoint, tolerance = 0): boolean {
  return (
    point.x >= rect.x - tolerance &&
    point.x <= rect.x + rect.width + tolerance &&
    point.y >= rect.y - tolerance &&
    point.y <= rect.y + rect.height + tolerance
  );
}

/** The smallest rectangle containing all of them. */
export function boundingBox(rects: readonly PdfRect[]): PdfRect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const bottom = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const top = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

/** Two quads sit on the same line when their vertical extents mostly overlap. */
function sameLine(left: PdfRect, right: PdfRect): boolean {
  const overlap =
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return overlap >= Math.min(left.height, right.height) / 2;
}

/**
 * One rectangle per LINE of a hit, not one per quad.
 *
 * pdfjs hands back a quad per text item, and a phrase like "SSN 545-45-6789"
 * routinely arrives as three of them. Burning each quad separately leaves hairline
 * gaps of untouched pixels between them, which is where the tail of a digit
 * survives. The quads of one hit on one line describe contiguous text, so their
 * bounding box is exactly the region that has to go — and it has no seams.
 */
export function mergeQuadsIntoLines(quads: readonly PdfRect[]): PdfRect[] {
  const lines: PdfRect[][] = [];
  for (const quad of [...quads].sort((left, right) => right.y - left.y || left.x - right.x)) {
    const line = lines.find((group) => group.some((member) => sameLine(member, quad)));
    if (line === undefined) lines.push([quad]);
    else line.push(quad);
  }
  return lines.map(boundingBox);
}

/**
 * One mark per line of a search hit, padded. Each mark remembers the hit it
 * came from, which is what lets the verification pass prove that exact text is
 * absent from the saved file.
 */
export function marksFromMatch(match: TextMatch, nextId: (line: number) => string): RedactionBox[] {
  return mergeQuadsIntoLines(match.quads).map((line, index) => ({
    id: nextId(index),
    page: match.page,
    rect: padRect(line),
    sourceMatch: match,
  }));
}

/** Every mark for a whole set of search hits, in document order. */
export function marksFromMatches(matches: readonly TextMatch[], prefix = 'find'): RedactionBox[] {
  return matches.flatMap((match) =>
    marksFromMatch(match, (quad) => `${prefix}-${match.index}-${quad}`)
  );
}

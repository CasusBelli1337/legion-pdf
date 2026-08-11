/**
 * Where a watermark's text sits on a page — the ONE calculation the applied ink
 * (core/stamps/watermark.ts) and the on-page preview (src/features/stamps) are
 * both drawn from. It lives in shared/ because those two zones cannot import
 * each other, and a watermark the attorney sees in a different place from the
 * one that lands in the file reads as a double-apply.
 *
 * Everything here is VISUAL space: origin at the bottom-left of the page as
 * displayed, x right, y up, `spin` counter-clockwise (see core/stamps/geometry).
 */

import type { PageSize, PdfPoint, WatermarkOrientation } from './types';

/** The angle a diagonal watermark runs at, counter-clockwise from level. */
export const WATERMARK_DIAGONAL_DEGREES = 45;

/**
 * Helvetica-Bold, per 1000 units of em — the face every stamp is drawn in
 * (core/stamps/ink.ts STAMP_FONT). The renderer has no font to measure, so the
 * two numbers pdf-lib's `heightAtSize` is built from are stated here instead;
 * core/stamps/watermark.test.ts fails if they ever drift from the real font.
 */
export const STAMP_FONT_ASCENDER = 718;
export const STAMP_FONT_DESCENDER = 207;
const PER_EM = 1000;

/** Size of a box, in points — the same shape core/stamps/geometry measures. */
export interface WatermarkBox {
  width: number;
  height: number;
}

/** Counter-clockwise turn, in degrees, for a watermark's orientation. */
export function watermarkSpin(orientation: WatermarkOrientation): number {
  return orientation === 'diagonal' ? WATERMARK_DIAGONAL_DEGREES : 0;
}

/** Height of one line of stamp text: ascender to descender, as pdf-lib measures it. */
export function stampTextHeight(fontSize: number): number {
  return ((STAMP_FONT_ASCENDER + STAMP_FONT_DESCENDER) * fontSize) / PER_EM;
}

/** How far the baseline sits above the bottom of that text box. */
export function stampBaselineLift(fontSize: number): number {
  return (STAMP_FONT_DESCENDER * fontSize) / PER_EM;
}

function turn(point: PdfPoint, spin: number): PdfPoint {
  const radians = (spin * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function centreOf(page: PageSize): PdfPoint {
  return { x: page.width / 2, y: page.height / 2 };
}

/**
 * Visual bottom-left of a text box centred on the page and spun about its own
 * centre — where the applied ink is drawn from.
 */
export function watermarkAnchor(page: PageSize, box: WatermarkBox, spin: number): PdfPoint {
  const centre = centreOf(page);
  const offset = turn({ x: box.width / 2, y: box.height / 2 }, spin);
  return { x: centre.x - offset.x, y: centre.y - offset.y };
}

/**
 * The MIDDLE of that text's baseline — where the preview draws from. It needs no
 * text width (a centred baseline is centred whatever the glyphs measure), which
 * is what lets the screen and the file agree without the renderer owning a font.
 */
export function watermarkBaselineMid(page: PageSize, fontSize: number, spin: number): PdfPoint {
  const centre = centreOf(page);
  const belowCentre = stampBaselineLift(fontSize) - stampTextHeight(fontSize) / 2;
  const offset = turn({ x: 0, y: belowCentre }, spin);
  return { x: centre.x + offset.x, y: centre.y + offset.y };
}

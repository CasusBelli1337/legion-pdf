/**
 * The arithmetic that makes the box the attorney drew and the text the engine
 * stamps the SAME box. Pure — no React, no DOM — so the WYSIWYG contract is
 * unit tested rather than eyeballed.
 *
 * Two decisions carry the whole thing:
 *
 * 1. Everything is derived from the drawn rectangle's box ON SCREEN, then
 *    converted back through `ViewerApi.clientToPdf`. The viewer's own transform
 *    already carries the zoom AND the page's /Rotate, so a box drawn on a
 *    sideways scan lands where it was drawn without this file knowing the page
 *    is sideways. Nothing here reads `zoom`; the same box drawn at 400% and at
 *    50% produces identical PDF options.
 * 2. The first line's origin is the engine's origin: the bottom-left of the
 *    first line's text box, inset from the top-left of the drawn rectangle.
 *    The overlay then places the typing surface so the browser's baseline falls
 *    on the engine's baseline, which is what makes the preview honest.
 */

import type { Box, ClientPoint } from '@renderer/components/viewer';
import type { PdfPoint, PdfRect, TextBoxOptions, TextFontChoice } from '@shared/types';
import { ascentPt, fontHeightPt, lineStepPt } from './font-metrics';

/** Breathing room inside the drawn box, in points, on every side. */
export const BOX_INSET_PT = 2;

/** A box smaller than this cannot hold a word; the drag was a stray click. */
export const MIN_BOX_PT = 8;

/** The browser's own vertical metrics for a face, per 1px of font size. */
export interface FontBox {
  ascent: number;
  descent: number;
}

/** Where the typing surface goes, in CSS pixels relative to the page. */
export interface EditorLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSizePx: number;
  lineHeightPx: number;
}

/** The drawn box's width in points, inset — its page height on a sideways page. */
function insetWidthPt(box: Box, scale: number): number {
  return box.width / scale - 2 * BOX_INSET_PT;
}

/** The width text wraps at inside the box. Independent of zoom by construction. */
export function wrapWidthPt(box: Box, scale: number): number {
  return Math.max(1, insetWidthPt(box, scale));
}

/**
 * True when the drag produced a box worth typing in. Measured in POINTS, on the
 * rectangle itself, so it says the same thing at every zoom level.
 */
export function isTypeable(rect: PdfRect): boolean {
  return Math.abs(rect.width) >= MIN_BOX_PT && Math.abs(rect.height) >= MIN_BOX_PT;
}

/**
 * The first line's origin in client coordinates — the bottom-left of the first
 * line's text box, as displayed. Hand this to `ViewerApi.clientToPdf` and the
 * result is exactly what `stamp:textBox` wants for `at`.
 *
 * `box` must be read fresh from the DOM at the moment of the commit; a page
 * that scrolled since the box was drawn has moved under it.
 */
export function firstLineOriginClient(
  box: Box,
  scale: number,
  font: TextFontChoice,
  fontSize: number
): ClientPoint {
  const inset = BOX_INSET_PT * scale;
  return {
    x: box.left + inset,
    y: box.top + inset + fontHeightPt(font.family, fontSize) * scale,
  };
}

/** Where the browser puts a line's baseline inside its line box. */
function baselineInLineBox(
  fontBox: FontBox | null,
  layout: { fontSizePx: number; lineHeightPx: number; ascentPx: number; heightPx: number }
): number {
  const screenAscent = fontBox === null ? layout.ascentPx : fontBox.ascent * layout.fontSizePx;
  const screenHeight =
    fontBox === null ? layout.heightPx : (fontBox.ascent + fontBox.descent) * layout.fontSizePx;
  return (layout.lineHeightPx - screenHeight) / 2 + screenAscent;
}

/**
 * Where to put the typing surface so the browser draws the first baseline on
 * the engine's first baseline.
 *
 * CSS centres a line's content area inside its line box (half-leading), and
 * that content area is the SCREEN face's ascent plus descent, which is taller
 * than the PDF face's. `fontBox` is that measurement; without it the PDF face's
 * own metrics are assumed, which is right to within a pixel at reading sizes.
 */
export function editorLayout(
  box: Box,
  scale: number,
  font: TextFontChoice,
  fontSize: number,
  fontBox: FontBox | null
): EditorLayout {
  const inset = BOX_INSET_PT * scale;
  const fontSizePx = fontSize * scale;
  const lineHeightPx = lineStepPt(font.family, fontSize) * scale;
  const ascentPx = ascentPt(font.family, fontSize) * scale;
  const heightPx = fontHeightPt(font.family, fontSize) * scale;
  const baseline = baselineInLineBox(fontBox, { fontSizePx, lineHeightPx, ascentPx, heightPx });
  return {
    left: box.left + inset,
    top: box.top + inset + ascentPx - baseline,
    width: Math.max(1, box.width - 2 * inset),
    height: Math.max(lineHeightPx, box.height - 2 * inset),
    fontSizePx,
    lineHeightPx,
  };
}

export interface TextBoxRequest {
  page: number;
  at: PdfPoint;
  text: string;
  fontSize: number;
  color: string;
  font: TextFontChoice;
  wrapWidthPt: number;
}

/** The exact options `stamp:textBox` is called with. One place, one shape. */
export function toTextBoxOptions(request: TextBoxRequest): TextBoxOptions {
  return {
    page: request.page,
    at: request.at,
    text: request.text,
    fontSize: request.fontSize,
    color: request.color,
    maxWidthPt: request.wrapWidthPt,
    font: request.font,
  };
}

/** The drawn rectangle as the whiteout op wants it, whichever way it was dragged. */
export function toWhiteoutRect(rect: PdfRect): PdfRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

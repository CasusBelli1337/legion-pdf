/**
 * A scan's inked rules (scan-rules.ts) set on the page they were scanned
 * from, beside whatever rules the file itself draws.
 */

import type { LayoutRule, PdfRect } from '@shared/types';
import type { PixelRule } from './scan-rules';

/** A picture covering at least this share of the page each way is the page's scan. */
const PAGE_SHARE = 0.7;

interface PlacedPicture {
  rect: PdfRect;
  widthPx: number;
  heightPx: number;
}

/** An upright picture: drawn the right way up, not turned or sheared. */
function isUpright(ctm: readonly number[]): boolean {
  const [a = 0, b = 0, c = 0, d = 0] = ctm;
  return a > 0 && d > 0 && Math.abs(b) < 1e-3 * a && Math.abs(c) < 1e-3 * d;
}

function coversPage(rect: PdfRect, view: readonly number[]): boolean {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = view;
  return rect.width >= PAGE_SHARE * (x1 - x0) && rect.height >= PAGE_SHARE * (y1 - y0);
}

/**
 * The picture's rules in page coordinates — only for an upright picture that
 * covers the page (a scan); a logo or an exhibit photo set into a typed page
 * keeps its lines to itself.
 */
export function placedScanRules(
  rules: readonly PixelRule[],
  picture: PlacedPicture,
  ctm: readonly number[],
  view: readonly number[]
): LayoutRule[] {
  const { rect, widthPx, heightPx } = picture;
  if (widthPx <= 0 || heightPx <= 0) return [];
  if (!isUpright(ctm) || !coversPage(rect, view)) return [];
  const sx = rect.width / widthPx;
  const sy = rect.height / heightPx;
  return rules.map((rule) => ({
    rect: {
      x: rect.x + rule.x * sx,
      y: rect.y + (heightPx - rule.y - rule.height) * sy,
      width: rule.width * sx,
      height: rule.height * sy,
    },
  }));
}

/** Rules this close, points, are the same rule. */
const SAME_RULE = 2;
/** A drawn rule this much inside a scanned one's reach is that rule over again. */
const ECHO_SHARE = 0.5;

function isLevel(rect: PdfRect): boolean {
  return rect.width >= rect.height;
}

function echoes(drawn: PdfRect, scanned: PdfRect): boolean {
  if (isLevel(drawn) !== isLevel(scanned)) return false;
  const level = isLevel(drawn);
  const at = (rect: PdfRect): number =>
    level ? rect.y + rect.height / 2 : rect.x + rect.width / 2;
  const from = (rect: PdfRect): number => (level ? rect.x : rect.y);
  const length = (rect: PdfRect): number => (level ? rect.width : rect.height);
  if (Math.abs(at(drawn) - at(scanned)) > SAME_RULE) return false;
  const shared =
    Math.min(from(drawn) + length(drawn), from(scanned) + length(scanned)) -
    Math.max(from(drawn), from(scanned));
  return shared >= ECHO_SHARE * length(drawn);
}

/**
 * The file's own rules without the ones that only trace the scan. OCR
 * software redraws the lines it sees as vector rules — one for a double rule,
 * some not at all; the scan's ink is the truth, so where the two agree the
 * ink is kept and the tracing dropped.
 */
export function withoutEchoes(
  drawn: readonly LayoutRule[],
  scanned: readonly LayoutRule[]
): LayoutRule[] {
  return drawn.filter((rule) => !scanned.some((ink) => echoes(rule.rect, ink.rect)));
}

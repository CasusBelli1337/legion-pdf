/**
 * Putting the typing surface exactly over a paragraph the page already has,
 * so the attorney edits the words where they sit. Pure — no React, no DOM —
 * so the arithmetic is unit tested rather than eyeballed.
 *
 * The block arrives from the engine in PDF user space with its first line's
 * baseline origin and its leading. The surface is placed so the browser's
 * first baseline falls on that origin, at the engine's leading, with the
 * paragraph's own alignment and first-line indent; text running at an angle is
 * turned about that same origin, so a sideways scan is edited sideways.
 */

import type { CSSProperties } from 'react';
import type { PageOverlayContext } from '@renderer/components/viewer';
import type { TextEditBlock, TextFontChoice } from '@shared/types';
import { familyForName } from '@shared/font-family-rules';
import { ascentPt, cssFontStack, fontHeightPt } from './font-metrics';
import { baselineInLineBox, type EditorLayout, type FontBox } from './text-geometry';

/** Room around the paragraph so a longer edit is not clipped mid-word. */
const WIDTH_SLACK_PX = 2;

export interface BlockEditorLayout extends EditorLayout {
  /** The paragraph's own frame on screen, for the dashed outline. */
  frame: { left: number; top: number; width: number; height: number };
  /** Extra styling the surface needs beyond the box: indent, alignment, turn. */
  style: CSSProperties;
}

/** The built-in face that stands in for the document's font on screen. */
export function screenFontFor(block: TextEditBlock): TextFontChoice {
  const choice: TextFontChoice = {
    family: familyForName(block.font.documentFont, block.font.designFamily),
  };
  if (block.font.bold) choice.bold = true;
  if (block.font.italic) choice.italic = true;
  return choice;
}

/** The paragraph's left edge along its baseline: the body lines, not an indented first one. */
function edgesOf(block: TextEditBlock): { left: number; firstIndent: number } {
  const angle = (block.angle * Math.PI) / 180;
  const along = (origin: { x: number; y: number }): number =>
    origin.x * Math.cos(angle) + origin.y * Math.sin(angle);
  const starts = block.lines.map((line) => along(line.origin));
  const body = starts.length > 1 ? starts.slice(1) : starts;
  const left = Math.min(...body);
  return { left, firstIndent: Math.max(0, (starts[0] ?? left) - left) };
}

export function blockEditorLayout(
  block: TextEditBlock,
  context: PageOverlayContext,
  fontBox: FontBox | null,
  grown: number
): BlockEditorLayout {
  const font = screenFontFor(block);
  const size = block.font.sizePt;
  const fontSizePx = size * context.scale;
  const lineHeightPx = block.leadingPt * context.scale;
  const ascentPx = ascentPt(font.family, size) * context.scale;
  const heightPx = fontHeightPt(font.family, size) * context.scale;
  const baseline = baselineInLineBox(fontBox, { fontSizePx, lineHeightPx, ascentPx, heightPx });
  const frame = context.toLocalBox(block.rect);
  const first = block.lines[0]?.origin ?? { x: block.rect.x, y: block.rect.y };
  const { left, firstIndent } = edgesOf(block);
  const angle = (block.angle * Math.PI) / 180;
  // The origin on screen, then stepped back along the baseline to the body's left edge.
  const origin = context.toLocalBox({ x: first.x, y: first.y, width: 0, height: 0 });
  const back = (first.x * Math.cos(angle) + first.y * Math.sin(angle) - left) * context.scale;
  const measure = Math.max(...block.lines.map((line) => line.width)) * context.scale;
  const rows = Math.max(block.lines.length, 1);
  const width = Math.max(measure, block.rect.width * context.scale) + WIDTH_SLACK_PX;
  return {
    left: origin.left - back * Math.cos(angle),
    top: origin.top + back * Math.sin(angle) - baseline,
    width,
    height: Math.max(lineHeightPx * rows, grown),
    fontSizePx,
    lineHeightPx,
    frame,
    style: {
      fontFamily: cssFontStack(font.family),
      fontWeight: font.bold === true ? 700 : 400,
      fontStyle: font.italic === true ? 'italic' : 'normal',
      textAlign: block.alignment === 'justify' ? 'justify' : block.alignment,
      textIndent: `${firstIndent * context.scale}px`,
      transformOrigin: `0 ${baseline}px`,
      transform: block.angle === 0 ? undefined : `rotate(${-block.angle}deg)`,
      whiteSpace: 'pre-wrap',
    },
  };
}

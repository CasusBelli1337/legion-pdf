/**
 * The classic bordered exhibit box: a hairline rule around a label, on white so
 * it reads over whatever is underneath.
 *
 * Exhibit stamps and slip sheets draw the identical box, so the metrics live in
 * one place — a label that came out centred on the page but off-centre on the
 * sheet would be the same bug twice.
 *
 * The box is measured on the INK (see `measureInk`), not on the font's line
 * box. Measuring the line box reserves the font's descent under every label,
 * and an all-caps label paints nothing there: at 65pt that is 13.5pt of white
 * under the text against 8pt of padding over it, which reads as a box sitting
 * too high on its own label.
 */

import type { PDFFont, PDFPage } from 'pdf-lib';
import type { PdfPoint } from '@shared/types';
import { BLACK, WHITE } from './color';
import type { BoxSize, PageFrame } from './geometry';
import { drawRect, drawText, measureInk, type InkBox } from './ink';

/** Breathing room between a label and its border, in points. */
export const LABEL_PADDING = 8;
export const LABEL_BORDER_WIDTH = 1.5;

export interface LabelMetrics {
  /** The band the glyphs paint in, and where their baseline sits in it. */
  ink: InkBox;
  /** What lands on the page: the ink band, grown by the border's padding. */
  box: BoxSize;
}

export function measureLabel(
  font: PDFFont,
  text: string,
  size: number,
  bordered: boolean
): LabelMetrics {
  const ink = measureInk(font, text, size);
  if (!bordered) return { ink, box: { width: ink.width, height: ink.height } };
  return {
    ink,
    box: {
      width: ink.width + 2 * LABEL_PADDING,
      height: ink.height + 2 * LABEL_PADDING,
    },
  };
}

export interface LabelInk {
  text: string;
  font: PDFFont;
  size: number;
  bordered: boolean;
  metrics: LabelMetrics;
  /** Visual bottom-left of the whole box (border included, when there is one). */
  at: PdfPoint;
  /** What to call this text if it cannot be printed, e.g. "exhibit label". */
  label?: string;
}

/** Draws the border (when asked for) and the label centred inside it. */
export function drawLabel(page: PDFPage, frame: PageFrame, ink: LabelInk): void {
  if (ink.bordered) {
    drawRect(page, frame, {
      at: ink.at,
      size: ink.metrics.box,
      fill: WHITE,
      border: BLACK,
      borderWidth: LABEL_BORDER_WIDTH,
    });
  }
  const inset = ink.bordered ? LABEL_PADDING : 0;
  drawText(page, frame, {
    text: ink.text,
    font: ink.font,
    size: ink.size,
    color: BLACK,
    at: { x: ink.at.x + inset, y: ink.at.y + inset },
    baseline: ink.metrics.ink.baseline,
    ...(ink.label === undefined ? {} : { label: ink.label }),
  });
}

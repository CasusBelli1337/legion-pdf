/**
 * The single brush every stamp paints with.
 *
 * Ink goes straight into the page's content stream — flattened by construction.
 * Nothing here creates an annotation, so no stamp Librarius applies can be
 * selected, moved, or deleted in another PDF reader (F-3/F-4/F-6 all depend on
 * that).
 *
 * Callers place ink in VISUAL space (see ./geometry) and this translates: the
 * anchor is the bottom-left of the box as displayed, `spin` turns the ink
 * within the displayed page, and the page's own /Rotate is added on top so the
 * result reads upright on a sideways page.
 */

import { degrees, StandardFonts } from 'pdf-lib';
import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import type { PdfPoint, TextFontChoice } from '@shared/types';
import { frameOf, toUserSpace, uprightDegrees, type BoxSize, type PageFrame } from './geometry';

/** Stamps use Helvetica-Bold: it survives photocopying, which Bates numbers must. */
export const STAMP_FONT = StandardFonts.HelveticaBold;
/** Body text (text boxes, whiteout retype) reads better in the regular weight. */
export const BODY_FONT = StandardFonts.Helvetica;

type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

/**
 * The twelve text faces every PDF reader has built in. Config over code: a new
 * family is a new row here, not a new branch. (Symbol and ZapfDingbats are the
 * other two standard fonts; neither is a face anyone types a note in.)
 */
const FONT_FACES: Record<TextFontChoice['family'], Record<FontStyle, StandardFonts>> = {
  helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
};

function styleOf(choice: TextFontChoice): FontStyle {
  if (choice.bold === true) return choice.italic === true ? 'boldItalic' : 'bold';
  return choice.italic === true ? 'italic' : 'regular';
}

/** The built-in face a choice maps to. No choice = BODY_FONT, unchanged. */
export function standardFontFor(choice?: TextFontChoice): StandardFonts {
  return choice === undefined ? BODY_FONT : FONT_FACES[choice.family][styleOf(choice)];
}

export function embedFont(document: PDFDocument, font: StandardFonts): Promise<PDFFont> {
  return document.embedFont(font);
}

/** Width and height of one line of text, as a box to place. */
export function measureText(font: PDFFont, text: string, size: number): BoxSize {
  return { width: font.widthOfTextAtSize(text, size), height: font.heightAtSize(size) };
}

/** How far the baseline sits above the bottom of a measured text box. */
export function baselineOffset(font: PDFFont, size: number): number {
  return font.heightAtSize(size) - font.heightAtSize(size, { descender: false });
}

function firstUnprintable(font: PDFFont, text: string): string | undefined {
  for (const character of text) {
    try {
      font.encodeText(character);
    } catch {
      return character;
    }
  }
  return undefined;
}

/**
 * The built-in PDF fonts speak WinAnsi — Western European text, curly quotes
 * and dashes included, but not Cyrillic or emoji. A character outside it must
 * be refused by name rather than silently dropped from a Bates number.
 */
export function assertPrintable(font: PDFFont, text: string, label = 'text'): void {
  try {
    font.encodeText(text);
    return;
  } catch {
    const character = firstUnprintable(font, text);
    throw new RangeError(
      `The ${label} contains "${character ?? '?'}", which the built-in PDF fonts cannot print. ` +
        'Remove that character and try again.'
    );
  }
}

export interface TextInk {
  text: string;
  font: PDFFont;
  size: number;
  color: RGB;
  /** Bottom-left of the text box, in visual space. */
  at: PdfPoint;
  /** Extra turn within the displayed page, counter-clockwise. Default 0. */
  spin?: number;
  opacity?: number;
  /** What to call this text if it cannot be printed, e.g. "Bates prefix". */
  label?: string;
}

/** Draws one line of text upright on the displayed page. */
export function drawText(page: PDFPage, frame: PageFrame, ink: TextInk): void {
  assertPrintable(ink.font, ink.text, ink.label);
  const spin = ink.spin ?? 0;
  const lift = baselineOffset(ink.font, ink.size);
  const radians = (spin * Math.PI) / 180;
  const baseline = {
    x: ink.at.x - lift * Math.sin(radians),
    y: ink.at.y + lift * Math.cos(radians),
  };
  const origin = toUserSpace(frame, baseline);
  page.drawText(ink.text, {
    x: origin.x,
    y: origin.y,
    size: ink.size,
    font: ink.font,
    color: ink.color,
    rotate: degrees(uprightDegrees(frame) + spin),
    ...(ink.opacity === undefined ? {} : { opacity: ink.opacity }),
  });
}

export interface RectInk {
  /** Bottom-left of the rectangle, in visual space. */
  at: PdfPoint;
  size: BoxSize;
  fill?: RGB;
  border?: RGB;
  borderWidth?: number;
  spin?: number;
  opacity?: number;
}

/** Draws a rectangle upright on the displayed page (backing boxes, borders). */
export function drawRect(page: PDFPage, frame: PageFrame, ink: RectInk): void {
  const origin = toUserSpace(frame, ink.at);
  page.drawRectangle({
    x: origin.x,
    y: origin.y,
    width: ink.size.width,
    height: ink.size.height,
    rotate: degrees(uprightDegrees(frame) + (ink.spin ?? 0)),
    borderWidth: ink.borderWidth ?? 0,
    ...(ink.fill === undefined ? {} : { color: ink.fill }),
    ...(ink.border === undefined ? {} : { borderColor: ink.border }),
    ...(ink.opacity === undefined ? {} : { opacity: ink.opacity }),
  });
}

export interface ImageInk {
  image: PDFImage;
  /** Bottom-left of the image, in visual space. */
  at: PdfPoint;
  size: BoxSize;
  opacity?: number;
}

/** Draws an embedded image upright on the displayed page (signatures). */
export function drawImage(page: PDFPage, frame: PageFrame, ink: ImageInk): void {
  const origin = toUserSpace(frame, ink.at);
  page.drawImage(ink.image, {
    x: origin.x,
    y: origin.y,
    width: ink.size.width,
    height: ink.size.height,
    rotate: degrees(uprightDegrees(frame)),
    ...(ink.opacity === undefined ? {} : { opacity: ink.opacity }),
  });
}

/** The frame of a page — media box, its origin, and its quarter turn. */
export function pageFrame(page: PDFPage): PageFrame {
  const box = page.getMediaBox();
  return frameOf({ width: box.width, height: box.height }, page.getRotation().angle, {
    x: box.x,
    y: box.y,
  });
}

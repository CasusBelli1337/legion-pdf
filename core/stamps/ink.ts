/**
 * The single brush every stamp paints with.
 *
 * Ink goes straight into the page's content stream — flattened by construction.
 * Nothing here creates an annotation, so no stamp Legion PDF applies can be
 * selected, moved, or deleted in another PDF reader (F-3/F-4/F-6 all depend on
 * that).
 *
 * Callers place ink in VISUAL space (see ./geometry) and this translates: the
 * anchor is the bottom-left of the box as displayed, `spin` turns the ink
 * within the displayed page, and the page's own /Rotate is added on top so the
 * result reads upright on a sideways page.
 */

import { degrees, StandardFonts } from 'pdf-lib';
import type { BlendMode, PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import type { PdfPoint, TextFontChoice } from '@shared/types';
import { frameOf, toUserSpace, uprightDegrees, type BoxSize, type PageFrame } from './geometry';

/** Stamps use Helvetica-Bold: it survives photocopying, which Bates numbers must. */
export const STAMP_FONT = StandardFonts.HelveticaBold;
/**
 * Body text (text boxes, whiteout retype) defaults to Times: court filings are
 * set in a serif face, so a note typed onto a pleading matches the page it
 * lands on instead of announcing itself in Helvetica.
 *
 * This is the built-in Times face every PDF reader carries, not the Monotype
 * Times New Roman file — the two share their advance widths, which is what
 * lets the on-screen preview wrap where the engine wraps, but the outlines are
 * Adobe's. The toolbar labels it "Times" for exactly that reason.
 */
export const BODY_FONT = StandardFonts.TimesRoman;

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

/**
 * Characters that paint materially below the baseline in the built-in faces.
 * The small tails on Q and J are a couple of percent of the em — they sit well
 * inside a stamp's padding — so they are deliberately not counted.
 */
const DESCENDING = /[gjpqyçþýÿµ¶,;()[\]{}@/\\|_]/;

/** A measured box, plus where the text baseline sits inside it. */
export interface InkBox extends BoxSize {
  /** How far the baseline sits above the box's bottom edge. */
  baseline: number;
}

/**
 * The box the glyphs ACTUALLY paint in — which is what a border has to be
 * centred on.
 *
 * `measureText` reports the font's full line box, ascent to descent. An exhibit
 * label is caps and digits, so nothing is drawn in that descent, and a border
 * measured from it carries the whole descent (0.207 em in Helvetica — 13.5pt at
 * 65pt) as dead white space under the label. Here the descent is reserved only
 * when the text has a glyph that uses it, so the band is the ink.
 */
export function measureInk(font: PDFFont, text: string, size: number): InkBox {
  const baseline = DESCENDING.test(text) ? baselineOffset(font, size) : 0;
  return {
    width: font.widthOfTextAtSize(text, size),
    height: font.heightAtSize(size, { descender: false }) + baseline,
    baseline,
  };
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
  /**
   * How far above `at` the baseline sits. Defaults to the font's full descent,
   * which is what `measureText` boxes; pass `measureInk(...).baseline` when the
   * anchor is the bottom of the INK rather than of the line box.
   */
  baseline?: number;
  /** Rule this line. Drawn, not a font variant — see DEFAULT_UNDERLINE_*. */
  underline?: boolean;
}

/**
 * Underline metrics, as a share of the text size. None of the fourteen built-in
 * faces has an underlined cut, so an underline is a drawn rule and these two
 * numbers are what make it look like type rather than a border: a hairline at
 * 1/14 em, dropped 1/10 em below the baseline so it clears the descenders in
 * "judgment" without floating off the word.
 */
export const DEFAULT_UNDERLINE_THICKNESS = 1 / 14;
export const DEFAULT_UNDERLINE_OFFSET = 1 / 10;

/** A point `distance` above `at` in the ink's own turned frame, in visual space. */
function above(at: PdfPoint, spin: number, distance: number): PdfPoint {
  const radians = (spin * Math.PI) / 180;
  return {
    x: at.x - distance * Math.sin(radians),
    y: at.y + distance * Math.cos(radians),
  };
}

/** The rule under one line: as wide as the TEXT, never as wide as its box. */
function drawUnderline(page: PDFPage, frame: PageFrame, ink: TextInk, lift: number): void {
  const thickness = ink.size * DEFAULT_UNDERLINE_THICKNESS;
  const drop = ink.size * DEFAULT_UNDERLINE_OFFSET;
  drawRect(page, frame, {
    at: above(ink.at, ink.spin ?? 0, lift - drop - thickness),
    size: { width: ink.font.widthOfTextAtSize(ink.text, ink.size), height: thickness },
    fill: ink.color,
    ...(ink.spin === undefined ? {} : { spin: ink.spin }),
    ...(ink.opacity === undefined ? {} : { opacity: ink.opacity }),
  });
}

/** Draws one line of text upright on the displayed page. */
export function drawText(page: PDFPage, frame: PageFrame, ink: TextInk): void {
  assertPrintable(ink.font, ink.text, ink.label);
  const spin = ink.spin ?? 0;
  const lift = ink.baseline ?? baselineOffset(ink.font, ink.size);
  const origin = toUserSpace(frame, above(ink.at, spin, lift));
  page.drawText(ink.text, {
    x: origin.x,
    y: origin.y,
    size: ink.size,
    font: ink.font,
    color: ink.color,
    rotate: degrees(uprightDegrees(frame) + spin),
    ...(ink.opacity === undefined ? {} : { opacity: ink.opacity }),
  });
  if (ink.underline === true) drawUnderline(page, frame, ink, lift);
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
  /**
   * How the fill combines with the page under it. Highlights use Multiply, so
   * black text stays black instead of being veiled by the marker.
   */
  blendMode?: BlendMode;
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
    ...(ink.blendMode === undefined ? {} : { blendMode: ink.blendMode }),
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

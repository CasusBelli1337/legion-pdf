/**
 * The twelve text faces every PDF reader has built in, keyed by the family and
 * style an attorney picks. Shared by the stamps (text boxes, whiteout retype)
 * and the text editor (re-setting a paragraph when the document's own font
 * cannot be reused), so both answer "Times bold" with the same face.
 *
 * Config over code: a new family is a new row here, not a new branch. (Symbol
 * and ZapfDingbats are the other two standard fonts; neither is a face anyone
 * types a note in.)
 */

import { StandardFonts } from 'pdf-lib';
import type { TextFontChoice } from '@shared/types';

/**
 * Body text defaults to Times: court filings are set in a serif face, so a note
 * typed onto a pleading matches the page it lands on instead of announcing
 * itself in Helvetica. This is the built-in Times face, not Monotype's Times
 * New Roman file — the two share advance widths, which is what lets an
 * on-screen preview wrap where the engine wraps.
 */
export const BODY_FONT = StandardFonts.TimesRoman;

type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

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

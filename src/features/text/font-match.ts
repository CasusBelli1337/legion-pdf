/**
 * "Match document text": naming the font a page is actually set in, and picking
 * the closest of the fourteen faces every PDF reader has built in.
 *
 * The rule that matters is honesty. Legion PDF embeds nothing, so a page set in
 * Minion Pro can only be answered with Times — and the attorney is told exactly
 * that, by name, rather than being shown a "matched" badge over a font that was
 * never matched. A pleading that has to look identical is a job for the
 * original word processor, and saying so costs nothing.
 */

import type { TextFontChoice } from '@shared/types';
import { builtInChoiceFor, stripSubsetPrefix } from '@shared/font-family-rules';
import { familyLabel } from './font-metrics';
import { PRODUCT_NAME } from '@shared/product';

export { stripSubsetPrefix };

/** What one run of text on the page says about its own face. */
export interface SampledFont {
  /** The PDF's own name for the face, e.g. "ABCDEF+TimesNewRomanPSMT". */
  name: string;
  /** pdfjs's coarse read of it: "serif", "sans-serif" or "monospace". */
  fallback?: string;
  /** The size that run was set in, in points. */
  sizePt?: number;
}

export interface FontMatch {
  font: TextFontChoice;
  /** The document's own name for the face, subset prefix stripped. */
  documentFont: string;
  /** Plain English, naming the real font whenever there is one to name. */
  note: string;
  /** True only when the document is already set in a built-in face. */
  exact: boolean;
  sizePt?: number;
}

/** The built-in face closest to a name, style flags read from the name itself. */
export function fontChoiceFor(sample: SampledFont): TextFontChoice {
  return builtInChoiceFor(sample.name, sample.fallback);
}

/** The base-14 faces themselves — the only names we may call an exact match. */
const BUILT_IN =
  /^(helvetica|times[- ]?(roman|new ?roman)?|courier([- ]?new)?)([-, ](bold|italic|oblique|bolditalic|boldoblique))?$/i;

function noteFor(documentFont: string, font: TextFontChoice, exact: boolean): string {
  if (exact) {
    return `This document uses ${documentFont} — the same font ${PRODUCT_NAME} types in.`;
  }
  if (documentFont === '') {
    return `The text near that box has no font name in the file — using ${familyLabel(font)}, the closest built-in match.`;
  }
  return `This document uses ${documentFont} — using ${familyLabel(font)}, the closest built-in match.`;
}

/**
 * The built-in face to type in, and what to tell the attorney about it. The
 * note always names the document's own font when the file records one.
 */
export function matchDocumentFont(sample: SampledFont): FontMatch {
  const documentFont = stripSubsetPrefix(sample.name).trim();
  const font = fontChoiceFor(sample);
  const exact = BUILT_IN.test(documentFont);
  const match: FontMatch = {
    font,
    documentFont,
    note: noteFor(documentFont, font, exact),
    exact,
  };
  if (sample.sizePt !== undefined && sample.sizePt > 0) {
    match.sizePt = Math.round(sample.sizePt * 10) / 10;
  }
  return match;
}

/** What to say when there is no text near the box to match against. */
export const NO_TEXT_TO_MATCH =
  'There is no text near that box to match. Draw the box over or beside the text you want to copy the font from.';

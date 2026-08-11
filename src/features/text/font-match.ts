/**
 * "Match document text": naming the font a page is actually set in, and picking
 * the closest of the fourteen faces every PDF reader has built in.
 *
 * The rule that matters is honesty. Librarius embeds nothing, so a page set in
 * Minion Pro can only be answered with Times — and the attorney is told exactly
 * that, by name, rather than being shown a "matched" badge over a font that was
 * never matched. A pleading that has to look identical is a job for the
 * original word processor, and saying so costs nothing.
 */

import type { TextFontChoice } from '@shared/types';
import { familyLabel, type TextFamily } from './font-metrics';

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

/**
 * Family by name, first rule wins. Config over code: a new family of real-world
 * font names is a new row, never a new branch. Sans is tested before serif so
 * "Century Gothic" does not land on "century".
 */
const FAMILY_RULES: readonly { pattern: RegExp; family: TextFamily }[] = [
  { pattern: /courier|mono|consol|menlo|typewriter|prestige|letter gothic/i, family: 'courier' },
  {
    pattern:
      /helvetica|arial|calibri|verdana|tahoma|segoe|futura|frutiger|myriad|gothic|grotesk|open ?sans|roboto|lato|univers/i,
    family: 'helvetica',
  },
  {
    pattern:
      /times|serif|georgia|garamond|palatino|book|century|cambria|minion|roman|caslon|baskerville|schoolbook|utopia/i,
    family: 'times',
  },
];

/** pdfjs' own fallback, used when the name itself says nothing useful. */
const FALLBACK_FAMILY: Record<string, TextFamily> = {
  monospace: 'courier',
  serif: 'times',
  'sans-serif': 'helvetica',
};

const BOLD = /bold|black|heavy|semib|demib|[-,_]bd\b/i;
/** Adobe abbreviates italic to "It" — as its own token, or straight after "Bold". */
const ITALIC = /italic|oblique|(?:^|[-,_ ]|bold)it\b/i;

/** The base-14 faces themselves — the only names we may call an exact match. */
const BUILT_IN =
  /^(helvetica|times[- ]?(roman|new ?roman)?|courier([- ]?new)?)([-, ](bold|italic|oblique|bolditalic|boldoblique))?$/i;

/** Subset-embedded fonts arrive as "ABCDEF+RealName". The prefix is noise. */
export function stripSubsetPrefix(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '');
}

function familyOf(name: string, fallback: string | undefined): TextFamily {
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(name)) return rule.family;
  }
  return FALLBACK_FAMILY[(fallback ?? '').toLowerCase()] ?? 'helvetica';
}

/** The built-in face closest to a name, style flags read from the name itself. */
export function fontChoiceFor(sample: SampledFont): TextFontChoice {
  const name = stripSubsetPrefix(sample.name);
  const choice: TextFontChoice = { family: familyOf(name, sample.fallback) };
  if (BOLD.test(name)) choice.bold = true;
  if (ITALIC.test(name)) choice.italic = true;
  return choice;
}

function noteFor(documentFont: string, font: TextFontChoice, exact: boolean): string {
  if (exact) {
    return `This document uses ${documentFont} — the same font Librarius types in.`;
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

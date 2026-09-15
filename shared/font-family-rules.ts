/**
 * Which of the three built-in families a real-world font name belongs to, and
 * whether the name says bold or italic. Shared by the renderer (the "Match
 * document text" toolbar) and the engine (re-setting an edited paragraph when
 * the document's own font cannot be reused), so the two can never disagree
 * about what "TimesNewRomanPS-BoldMT" means. A VALUE module: shared/types.ts is
 * type-only.
 *
 * Config over code: a new family of names is a new row, never a new branch.
 * Sans is tested before serif so "Century Gothic" does not land on "century".
 */

import type { TextFontChoice } from './options-marks';

export type BuiltInFamily = TextFontChoice['family'];

const FAMILY_RULES: readonly { pattern: RegExp; family: BuiltInFamily }[] = [
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

/** pdfjs' own fallback family, used when the name itself says nothing useful. */
const FALLBACK_FAMILY: Record<string, BuiltInFamily> = {
  monospace: 'courier',
  serif: 'times',
  'sans-serif': 'helvetica',
};

export const BOLD_NAME = /bold|black|heavy|semib|demib|[-,_]bd\b/i;
/** Adobe abbreviates italic to "It" — as its own token, or straight after "Bold". */
export const ITALIC_NAME = /italic|oblique|(?:^|[-,_ ]|bold)it\b/i;

/** Subset-embedded fonts arrive as "ABCDEF+RealName". The prefix is noise. */
export function stripSubsetPrefix(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '');
}

export function familyForName(name: string, fallback?: string): BuiltInFamily {
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(name)) return rule.family;
  }
  return FALLBACK_FAMILY[(fallback ?? '').toLowerCase()] ?? 'helvetica';
}

/** The built-in face closest to a font name, style flags read from the name. */
export function builtInChoiceFor(name: string, fallback?: string): TextFontChoice {
  const stripped = stripSubsetPrefix(name);
  const choice: TextFontChoice = { family: familyForName(stripped, fallback) };
  if (BOLD_NAME.test(stripped)) choice.bold = true;
  if (ITALIC_NAME.test(stripped)) choice.italic = true;
  return choice;
}

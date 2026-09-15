/**
 * From the file's own font name to the name Word should ask for, plus the
 * style flags a name carries. Config over code: a real-world family is a row in
 * FONT_RULES, never a branch.
 *
 * Honesty rule: a name no rule knows is still passed to Word AS A NAME —
 * "Minion Pro", say — because Word substitutes a missing face gracefully and an
 * attorney who owns the font gets it back exactly. Only a name with nothing
 * readable in it falls back to the pdfjs family (serif / sans / mono).
 */

import type { LayoutFont } from '@shared/types';

export interface RunStyle {
  wordFont: string;
  bold: boolean;
  italic: boolean;
}

const FONT_RULES: readonly { pattern: RegExp; wordFont: string }[] = [
  { pattern: /times|tinos|liberation ?serif|nimbus ?rom|thorndale/i, wordFont: 'Times New Roman' },
  { pattern: /arial|helvetica|arimo|liberation ?sans|nimbus ?san|albany/i, wordFont: 'Arial' },
  { pattern: /calibri|carlito/i, wordFont: 'Calibri' },
  { pattern: /cambria|caladea/i, wordFont: 'Cambria' },
  { pattern: /courier|cousine|liberation ?mono|nimbus ?mono|cumberland/i, wordFont: 'Courier New' },
  { pattern: /century ?schoolbook|schlbk|new ?century/i, wordFont: 'Century Schoolbook' },
  { pattern: /century ?gothic/i, wordFont: 'Century Gothic' },
  { pattern: /book ?antiqua|palatino|palladio/i, wordFont: 'Book Antiqua' },
  { pattern: /bookman/i, wordFont: 'Bookman Old Style' },
  { pattern: /garamond/i, wordFont: 'Garamond' },
  { pattern: /georgia/i, wordFont: 'Georgia' },
  { pattern: /verdana/i, wordFont: 'Verdana' },
  { pattern: /tahoma/i, wordFont: 'Tahoma' },
  { pattern: /segoe/i, wordFont: 'Segoe UI' },
  { pattern: /trebuchet/i, wordFont: 'Trebuchet MS' },
  { pattern: /franklin/i, wordFont: 'Franklin Gothic' },
  { pattern: /consolas/i, wordFont: 'Consolas' },
  { pattern: /wingdings/i, wordFont: 'Wingdings' },
  { pattern: /^symbol/i, wordFont: 'Symbol' },
];

const FAMILY_FALLBACK: Record<string, string> = {
  serif: 'Times New Roman',
  'sans-serif': 'Arial',
  monospace: 'Courier New',
};

const BOLD = /bold|black|heavy|semib|demib|extrab|ultrab|[-,_]bd\b/i;
const ITALIC = /italic|oblique|[-,_ ]it\b|boldit|[-,]bi\b/i;

/** Subset-embedded fonts arrive as "ABCDEF+RealName". The prefix is noise. */
export function stripSubsetPrefix(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '');
}

/** "MinionPro-BoldIt" → "Minion Pro": the family, spaced, styles and vendor tags gone. */
export function readableFamily(name: string): string {
  const family = stripSubsetPrefix(name).split(/[-,]/)[0] ?? '';
  return family
    .replace(/(PSMT|MT|PS|Regular|Roman|Std|Pro)$/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

export function wordFontFor(font: LayoutFont): string {
  const name = stripSubsetPrefix(font.name);
  const rule = FONT_RULES.find((entry) => entry.pattern.test(name));
  if (rule !== undefined) return rule.wordFont;
  const readable = readableFamily(name);
  if (/[A-Za-z]{3,}/.test(readable)) return readable;
  return FAMILY_FALLBACK[font.family] ?? 'Times New Roman';
}

/** Bold and italic from the name and from pdfjs' own flags, whichever says so. */
export function runStyleFor(font: LayoutFont): RunStyle {
  const name = stripSubsetPrefix(font.name);
  return {
    wordFont: wordFontFor(font),
    bold: font.bold || BOLD.test(name),
    italic: font.italic || ITALIC.test(name),
  };
}

/** Word sizes in half-points; a PDF size is rounded to the nearest half. */
export function halfPoints(sizePt: number): number {
  return Math.max(1, Math.round(sizePt * 2));
}

/** "#1a2B3c" / "1a2b3c" → "1A2B3C"; anything unreadable is black. */
export function hexColor(color: string | undefined): string {
  const digits = (color ?? '').replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(digits) ? digits : '000000';
}

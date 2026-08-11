/**
 * Exhibit letters for the panel: A, B, ... Z, AA. Advancing the label after a
 * stamp is what makes a stack of files come out A, B, C without retyping.
 *
 * This mirrors core/stamps/exhibit-label.ts on purpose — the renderer is not
 * allowed to import core (see docs/ARCHITECTURE.md zone rules), the same reason
 * src/features/organize/range-input.ts has its own parser. Both sides are
 * tested against the same Z -> AA cases; change them together.
 */

const TRAILING_LETTERS = /([A-Za-z]+)\s*$/;
const TRAILING_DIGITS = /(\d+)\s*$/;
const ALPHABET_SIZE = 26;
const LETTER_A = 'A'.charCodeAt(0);
/** "EXHIBIT A" counts on the A; a bare word like "Exhibit" is not a counter. */
const MAX_LETTER_RUN = 3;

function counterLetters(label: string): string | undefined {
  const letters = TRAILING_LETTERS.exec(label)?.[1];
  return letters !== undefined && letters.length <= MAX_LETTER_RUN ? letters : undefined;
}

function ordinalToLetter(ordinal: number): string {
  let remaining = ordinal;
  let letters = '';
  while (remaining > 0) {
    const digit = (remaining - 1) % ALPHABET_SIZE;
    letters = String.fromCharCode(LETTER_A + digit) + letters;
    remaining = Math.floor((remaining - 1) / ALPHABET_SIZE);
  }
  return letters;
}

function letterToOrdinal(letters: string): number {
  let ordinal = 0;
  for (const character of letters.toUpperCase()) {
    ordinal = ordinal * ALPHABET_SIZE + (character.charCodeAt(0) - LETTER_A + 1);
  }
  return ordinal;
}

/**
 * The next label in the sequence, or null when there is nothing to count on —
 * the panel leaves the label alone rather than mangling it.
 */
export function nextExhibitLabel(label: string): string | null {
  const letters = counterLetters(label);
  if (letters !== undefined) {
    const next = ordinalToLetter(letterToOrdinal(letters) + 1);
    const cased = letters === letters.toLowerCase() ? next.toLowerCase() : next;
    return label.replace(TRAILING_LETTERS, (match) => match.replace(letters, cased));
  }
  const digits = TRAILING_DIGITS.exec(label)?.[1];
  if (digits !== undefined) {
    const next = String(Number(digits) + 1).padStart(digits.length, '0');
    return label.replace(TRAILING_DIGITS, (match) => match.replace(digits, next));
  }
  return null;
}

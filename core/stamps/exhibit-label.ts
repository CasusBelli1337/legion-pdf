/**
 * Exhibit letters, the way a litigator counts them: A, B, ... Z, AA, AB, ...
 *
 * This is bijective base-26 (there is no "zero" letter), which is why AZ is
 * followed by BA and ZZ by AAA. The trailing letter run is what advances, so a
 * whole label carries: "EXHIBIT A" becomes "EXHIBIT B" and "Exhibit Z" becomes
 * "Exhibit AA". Numbered exhibits ("Exhibit 12") advance too.
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

/** "A" -> 1, "Z" -> 26, "AA" -> 27. Case-insensitive. */
export function letterToOrdinal(letters: string): number {
  let ordinal = 0;
  for (const character of letters.toUpperCase()) {
    ordinal = ordinal * ALPHABET_SIZE + (character.charCodeAt(0) - LETTER_A + 1);
  }
  return ordinal;
}

/** 1 -> "A", 26 -> "Z", 27 -> "AA". */
export function ordinalToLetter(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new RangeError(`Exhibit letters start at 1 (A); ${ordinal} is not a position.`);
  }
  let remaining = ordinal;
  let letters = '';
  while (remaining > 0) {
    const digit = (remaining - 1) % ALPHABET_SIZE;
    letters = String.fromCharCode(LETTER_A + digit) + letters;
    remaining = Math.floor((remaining - 1) / ALPHABET_SIZE);
  }
  return letters;
}

function advanceLetters(label: string, letters: string, by: number): string {
  const next = ordinalToLetter(letterToOrdinal(letters) + by);
  const cased = letters === letters.toLowerCase() ? next.toLowerCase() : next;
  return label.replace(TRAILING_LETTERS, (match) => match.replace(letters, cased));
}

function advanceDigits(label: string, digits: string, by: number): string {
  const next = String(Number(digits) + by).padStart(digits.length, '0');
  return label.replace(TRAILING_DIGITS, (match) => match.replace(digits, next));
}

/**
 * The label `by` places after this one. Advances the trailing letters, or the
 * trailing digits when the label is numbered instead of lettered.
 */
export function advanceExhibitLabel(label: string, by: number): string {
  if (by === 0) return label;
  const letters = counterLetters(label);
  if (letters !== undefined) return advanceLetters(label, letters, by);
  const digits = TRAILING_DIGITS.exec(label)?.[1];
  if (digits !== undefined) return advanceDigits(label, digits, by);
  throw new RangeError(
    `"${label}" does not end in an exhibit letter or number — try "EXHIBIT A" or "Exhibit 1".`
  );
}

/** The next label in the sequence: "EXHIBIT A" -> "EXHIBIT B". */
export function nextExhibitLabel(label: string): string {
  return advanceExhibitLabel(label, 1);
}

/** `count` labels starting at `start` — what stamping a stack of files needs. */
export function exhibitSequence(start: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`An exhibit run covers at least one label, not ${count}.`);
  }
  return Array.from({ length: count }, (_unused, index) => advanceExhibitLabel(start, index));
}

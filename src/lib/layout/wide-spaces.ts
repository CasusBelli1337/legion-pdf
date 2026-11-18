/**
 * Two spaces after a sentence, as the typist left them. pdfjs' text content
 * folds a run of spaces into one, but the line still measures what it was
 * typed as: a paragraph rebuilt from the folded text sets a space narrower
 * for every sentence on the line, the next line's first word fits on the end
 * of it, and Word re-wraps the paragraph a line short. The show-text
 * operators still carry every space glyph, so the doubled ones are read off
 * them and put back, located by the letters before them (the same invariant
 * colour-align.ts matches on).
 */

const LETTER = /[\p{L}\p{N}]/gu;

/** Letters and digits in a string, NFKC-normalised so a ligature counts its letters. */
export function countLetters(text: string): number {
  return text.normalize('NFKC').match(LETTER)?.length ?? 0;
}

export interface GlyphShape {
  /** Letters and digits shown — what the text items are matched against. */
  letters: number;
  /** For each run of two or more space glyphs: the letters shown before it in this operator. */
  doubled: number[];
  /** Whether the operator ended on a space glyph (a run of spaces can straddle two operators). */
  endsSpaced: boolean;
}

export interface GlyphLike {
  unicode?: unknown;
  isSpace?: unknown;
  /** The glyph's advance, thousandths of the font size. */
  width?: unknown;
}

/** What one show-text operator drew. `afterSpace`: the pen is still against a space the operator before it drew. */
export function glyphShape(glyphs: unknown, afterSpace = false): GlyphShape {
  const shape: GlyphShape = { letters: 0, doubled: [], endsSpaced: afterSpace };
  let spaces = afterSpace ? 1 : 0;
  for (const glyph of glyphsOf(glyphs)) {
    const unicode = typeof glyph.unicode === 'string' ? glyph.unicode : '';
    spaces = isSpace(glyph, unicode) ? spaces + 1 : 0;
    if (spaces === 2) shape.doubled.push(shape.letters);
    if (spaces === 0) shape.letters += countLetters(unicode);
  }
  shape.endsSpaced = spaces > 0;
  return shape;
}

/** The glyphs of a show-text operator; the numbers between them are kerning, not glyphs. */
function glyphsOf(glyphs: unknown): GlyphLike[] {
  if (!Array.isArray(glyphs)) return [];
  return (glyphs as unknown[]).filter(
    (glyph): glyph is GlyphLike => typeof glyph === 'object' && glyph !== null
  );
}

function isSpace(glyph: GlyphLike, unicode: string): boolean {
  return glyph.isSpace === true || unicode === ' ';
}

/** `text` with the single space that follows its first `lettersBefore` letters doubled, if one is there. */
function doubledAt(text: string, lettersBefore: number): string {
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (seen === lettersBefore && char === ' ') {
      const lone = text[index + 1] !== ' ' && text[index - 1] !== ' ';
      const inside = index > 0 && index < text.length - 1;
      return lone && inside ? `${text.slice(0, index)} ${text.slice(index)}` : text;
    }
    seen += countLetters(char);
    if (seen > lettersBefore) return text;
  }
  return text;
}

/** `text` ending in the two spaces that were typed after its last letter. */
function doubledAtEnd(text: string): string {
  return `${text.trimEnd()}  `;
}

/** A text item as far as this needs it: its string, and where it sits when pdfjs said. */
export interface SpacedItem {
  str: string;
  transform?: readonly number[];
  width?: number;
  height?: number;
}

/** Two spaces of any text face are at least this wide (× size); one, unstretched, is at most 0.3. */
const PAIR_GAP = 0.4;

/**
 * Whether the gap after item `index` is two spaces wide: measured to the next
 * item that has text, on the same line. The letters cannot tell "e-mail)  :"
 * from "e-mail):  " — the colon is no letter — and a pair set where there was
 * one space made the line too long for its paragraph.
 */
function pairFollows(items: readonly SpacedItem[], index: number): boolean {
  const here = placed(items[index]);
  const next = placed(items.slice(index + 1).find((other) => other.str.trim().length > 0));
  if (here === null || next === null || here.size <= 0) return false;
  const sameLine = Math.abs(next.y - here.y) < 0.5 * here.size;
  return sameLine && next.x - here.right >= PAIR_GAP * here.size;
}

interface Placed {
  x: number;
  y: number;
  right: number;
  size: number;
}

function placed(item: SpacedItem | undefined): Placed | null {
  if (item?.transform === undefined) return null;
  const [, , , , x = 0, y = 0] = item.transform;
  return { x, y, right: x + (item.width ?? 0), size: item.height ?? 0 };
}

/**
 * Each text item's string with its doubled spaces put back. Items and
 * operators are matched by letters in stream order; a doubled space inside an
 * item is only restored where the item really has a lone space at that spot,
 * so a page whose counts stop agreeing is left as pdfjs read it. A pair that
 * falls between two items (pdfjs often ends an item at a sentence) is carried
 * at the end of the first — the line builder adds no space after one — and
 * only where the gap between the two is that wide.
 */
export function withWideSpaces(
  items: readonly SpacedItem[],
  shapes: readonly Pick<GlyphShape, 'letters' | 'doubled'>[]
): string[] {
  const spots: number[] = [];
  let shown = 0;
  for (const shape of shapes) {
    for (const before of shape.doubled) spots.push(shown + before);
    shown += shape.letters;
  }
  if (spots.length === 0) return items.map((item) => item.str);
  const cursor = { start: 0, next: 0 };
  return items.map((item, index) => {
    const typed = typedItem(item.str, spots, cursor);
    return typed.pairAtEnd && pairFollows(items, index) ? doubledAtEnd(typed.text) : typed.text;
  });
}

interface SpotCursor {
  /** Letters shown before the current item. */
  start: number;
  /** The first pair not yet placed. */
  next: number;
}

/** The item with the pairs inside it restored, and whether a pair was typed right after its last letter. */
function typedItem(
  str: string,
  spots: readonly number[],
  cursor: SpotCursor
): { text: string; pairAtEnd: boolean } {
  const { start } = cursor;
  const end = start + countLetters(str);
  const at = (index: number): number => spots[index] ?? Number.POSITIVE_INFINITY;
  // A pair at or before the item's first letter belongs to no item: nothing precedes it here.
  while (at(cursor.next) <= start) cursor.next += 1;
  const inside: number[] = [];
  while (at(cursor.next) < end) inside.push(at(cursor.next++));
  let text = str;
  // Right to left, so an insertion never moves a later spot's letters.
  for (const spot of inside.reverse()) text = doubledAt(text, spot - start);
  const pairAtEnd = end > start && at(cursor.next) === end;
  if (pairAtEnd) cursor.next += 1;
  cursor.start = end;
  return { text, pairAtEnd };
}

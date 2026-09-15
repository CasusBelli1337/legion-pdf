/**
 * Matching text items to the show-text operators that drew them. pdfjs reports
 * text content and the operator list in the same content-stream order, but it
 * splits and merges them differently — a text item may span several operators
 * or be one slice of one. Letters are the invariant: each item takes the next
 * so many letters off the operator stream, and wears the colour and visibility
 * of the operator its first letter came from. If the counts stop agreeing the
 * rest of the page falls back to black and visible, which is never a lie a
 * reader can see.
 */

import { countLetters } from './op-walk';
import type { TextOp } from './op-walk';

export interface ItemStyle {
  colorHex: string;
  hidden: boolean;
}

const DEFAULT: ItemStyle = { colorHex: '#000000', hidden: false };

interface Cursor {
  op: number;
  /** Letters already taken from the current operator. */
  taken: number;
}

function currentOp(texts: readonly TextOp[], cursor: Cursor): TextOp | null {
  while (cursor.op < texts.length) {
    const op = texts[cursor.op];
    if (op !== undefined && cursor.taken < op.letters) return op;
    cursor.op += 1;
    cursor.taken = 0;
  }
  return null;
}

function consume(texts: readonly TextOp[], cursor: Cursor, letters: number): void {
  let left = letters;
  while (left > 0) {
    const op = currentOp(texts, cursor);
    if (op === null) return;
    const take = Math.min(left, op.letters - cursor.taken);
    cursor.taken += take;
    left -= take;
  }
}

/** One style per text item, in item order. */
export function alignTextStyles(
  items: readonly { str: string }[],
  texts: readonly TextOp[]
): ItemStyle[] {
  const cursor: Cursor = { op: 0, taken: 0 };
  return items.map((item) => {
    const letters = countLetters(item.str);
    const op = currentOp(texts, cursor);
    const style = op === null ? DEFAULT : { colorHex: op.colorHex, hidden: op.hidden };
    if (letters > 0) consume(texts, cursor, letters);
    return style;
  });
}

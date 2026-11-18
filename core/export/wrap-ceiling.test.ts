import { describe, expect, it } from 'vitest';
import { relativeWidth } from './font-widths';
import type { Line } from './model';
import { firstWordWidth, wrapCeiling } from './wrap-ceiling';

function line(text: string, x: number, right: number): Line {
  const run = {
    text,
    fontKey: 'f1',
    sizePt: 12,
    colorHex: '000000',
    underline: false,
    hidden: false,
  };
  return { cells: [{ x, right, runs: [run] }], baseline: 700, x, right, sizePt: 12, blockId: null };
}

describe('firstWordWidth', () => {
  it('weighs the word letter by letter: narrow letters make a narrow word', () => {
    // Eight characters of forty, but i, t, r and the apostrophe are narrow ones.
    const text = 'parties’ pleadings in order to determine';
    const width = firstWordWidth(line(text, 90, 90 + 220));
    expect(width).toBeLessThan((8 / text.length) * 220);
    expect(width).toBeGreaterThan(30);
  });

  it('is nothing for a line with no text', () => {
    expect(firstWordWidth(line('', 90, 90))).toBe(0);
  });
});

describe('wrapCeiling', () => {
  it('stops short of the room the next line’s first word would need', () => {
    // A face a tenth wider than Times: 13.2 pt per thousand units at 12 pt.
    const set = (text: string): Line => line(text, 90, 90 + relativeWidth(text) * 0.0132);
    const above = set('a mechanism to cut through the');
    const ceiling = wrapCeiling([above, set('parties’ pleadings in order to determine whether')]);
    const word = relativeWidth('parties’') * 0.0132;
    expect(ceiling).toBeLessThan(above.right + 3.3 + word);
    expect(ceiling).toBeGreaterThan(above.right + 0.9 * word);
  });

  it('has no ceiling for a single line', () => {
    expect(wrapCeiling([line('one line only', 90, 200)])).toBe(Number.POSITIVE_INFINITY);
  });
});

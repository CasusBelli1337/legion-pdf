import { describe, expect, it } from 'vitest';
import { lineText, linesOf } from './lines';
import { run } from './layout-testkit';

/** Eight words, each `step` points lower than the one before: a line read off a tilted scan. */
function tilted(words: string, y: number, step: number, hidden: boolean) {
  let x = 72;
  return words.split(' ').map((word, index) => {
    const placed = run(word, x, y - index * step, { sizePt: 10, hidden });
    x += placed.width + 3;
    return placed;
  });
}

describe('linesOf — a recognised line off a tilted scan', () => {
  const words = 'the lien was recorded in the county records';

  it('keeps the whole line together though its last word sits well below its first', () => {
    // 4.2 pt from end to end: past the 3.5 pt a 10 pt line normally allows.
    const lines = linesOf(tilted(words, 700, 0.6, true));
    expect(lines.map(lineText)).toEqual([words]);
  });

  it('still tells two recognised lines apart', () => {
    const lines = linesOf([
      ...tilted(words, 700, 0.6, true),
      ...tilted('and the claim was verified by its officer', 688, 0.6, true),
    ]);
    expect(lines).toHaveLength(2);
    expect(lineText(lines[0]!)).toBe(words);
  });

  it('leaves typed text to the strict tolerance', () => {
    expect(linesOf(tilted(words, 700, 0.6, false)).length).toBeGreaterThan(1);
  });
});

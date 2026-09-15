import { describe, expect, it } from 'vitest';
import { isUnderlined, lineText, linesOf } from './lines';
import { run } from './layout-testkit';

describe('linesOf', () => {
  it('joins runs on one baseline into one line, in x order, with a space where the gap says so', () => {
    const lines = linesOf([
      run('brown', 72 + 6 * 6 + 3, 700),
      run('quick', 72, 700),
      run('fox', 72 + 12 * 6 + 6, 700),
    ]);
    expect(lines).toHaveLength(1);
    expect(lineText(lines[0]!)).toBe('quick brown fox');
    expect(lines[0]!.cells[0]!.runs).toHaveLength(1);
  });

  it('does not double a space a run already carries', () => {
    const lines = linesOf([run('quick ', 72, 700), run('brown', 72 + 36 + 3, 700)]);
    expect(lineText(lines[0]!)).toBe('quick brown');
  });

  it('keeps a bold word as its own run inside the line', () => {
    const lines = linesOf([
      run('the ', 72, 700),
      run('trust', 72 + 24, 700, { fontKey: 'timesBold' }),
      run(' instrument', 72 + 54, 700),
    ]);
    const runs = lines[0]!.cells[0]!.runs;
    expect(runs.map((entry) => entry.text)).toEqual(['the ', 'trust', ' instrument']);
    expect(runs[1]!.fontKey).toBe('timesBold');
  });

  it('separates baselines further apart than the tolerance into different lines', () => {
    const lines = linesOf([run('first', 72, 700), run('second', 72, 686), run('third', 72, 672)]);
    expect(lines.map(lineText)).toEqual(['first', 'second', 'third']);
  });

  it('tolerates a superscript that sits a hair above the baseline', () => {
    const lines = linesOf([run('footnote', 72, 700), run('1', 120, 703, { sizePt: 8 })]);
    expect(lines).toHaveLength(1);
  });

  it('opens a new cell at a gap wider than a couple of ems', () => {
    const lines = linesOf([run('Item', 72, 700), run('$1,200.00', 300, 700)]);
    expect(lines[0]!.cells.map((cell) => cell.x)).toEqual([72, 300]);
    expect(lineText(lines[0]!)).toBe('Item\t$1,200.00');
  });

  it('drops runs that are only whitespace', () => {
    expect(linesOf([run('   ', 72, 700), run('', 72, 686)])).toEqual([]);
  });

  it('reports the size most of the characters are set in', () => {
    const lines = linesOf([
      run('Heading', 72, 700, { sizePt: 18 }),
      run('x', 200, 700, { sizePt: 8 }),
    ]);
    expect(lines[0]!.sizePt).toBe(18);
  });
});

describe('isUnderlined', () => {
  const word = run('signature', 72, 700);

  it('sees a thin rule just under the baseline that spans the run', () => {
    expect(isUnderlined(word, [{ rect: { x: 70, y: 698.5, width: 60, height: 0.6 } }])).toBe(true);
  });

  it('ignores a rule that covers only part of the run', () => {
    expect(isUnderlined(word, [{ rect: { x: 90, y: 698.5, width: 20, height: 0.6 } }])).toBe(false);
  });

  it('ignores a rule too far below, or above, the baseline', () => {
    expect(isUnderlined(word, [{ rect: { x: 70, y: 690, width: 60, height: 0.6 } }])).toBe(false);
    expect(isUnderlined(word, [{ rect: { x: 70, y: 702, width: 60, height: 0.6 } }])).toBe(false);
  });
});

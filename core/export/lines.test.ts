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

  it('sets the space after a raised footnote mark with the text that follows it', () => {
    const [line] = linesOf([
      run('a complete defense', 72, 700, { width: 100 }),
      run('1', 172.5, 704.5, { sizePt: 8, width: 4 }),
      run('– Ashford,', 179.5, 700, { width: 50 }),
    ]);
    expect(line!.cells[0]!.runs.map((entry) => entry.text)).toEqual([
      'a complete defense',
      '1',
      ' – Ashford,',
    ]);
  });

  it('opens a new cell at a gap wider than a couple of ems', () => {
    const lines = linesOf([run('Item', 72, 700), run('$1,200.00', 300, 700)]);
    expect(lines[0]!.cells.map((cell) => cell.x)).toEqual([72, 300]);
    expect(lineText(lines[0]!)).toBe('Item\t$1,200.00');
  });

  it('keeps a checkbox in a cell of its own, however close the text beside it', () => {
    const [line] = linesOf([
      run('a.', 140, 700),
      run('\u2610', 160, 700, { width: 11.6 }),
      run('By personal service.', 176, 700),
    ]);
    expect(line?.cells.map((cell) => cell.runs.map((entry) => entry.text).join(''))).toEqual([
      'a.',
      '\u2610',
      'By personal service.',
    ]);
    expect(line?.cells[2]?.x).toBe(176);
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

describe('linesOf — dot leaders', () => {
  it('drops a table-of-contents leader and marks the page number as a right-tabbed cell', () => {
    const line = linesOf([
      run('I.  INTRODUCTION', 72, 700),
      run('.....................................', 180, 700, { width: 300 }),
      run('3', 500, 700, { width: 6 }),
    ])[0];
    expect(line?.cells.map((cell) => cell.runs.map((r) => r.text).join(''))).toEqual([
      'I.  INTRODUCTION',
      '3',
    ]);
    expect(line?.cells[1]?.leader).toBe('dot');
    expect(line?.cells[1]?.right).toBe(506);
  });
});

describe('linesOf — a leader glued to its entry', () => {
  it('strips trailing dots from the entry and still right-tabs the page number', () => {
    const line = linesOf([
      run('II.  STATEMENT OF FACTS .........................', 72, 700, { width: 340 }),
      run('4', 500, 700, { width: 6 }),
    ])[0];
    expect(line?.cells.map((cell) => cell.runs.map((r) => r.text).join(''))).toEqual([
      'II.  STATEMENT OF FACTS',
      '4',
    ]);
    expect(line?.cells[1]?.leader).toBe('dot');
  });
});

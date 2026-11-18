import { describe, expect, it } from 'vitest';
import { run } from './layout-testkit';
import { leaderParts } from './leaders';
import { linesOf } from './lines';

describe('leaderParts', () => {
  it('splits an entry, its dots and its page number written as one run', () => {
    const parts = leaderParts(
      run('INTRODUCTION ............................ 12', 130, 700, { width: 440 })
    );
    expect(parts.map((part) => part.text)).toEqual([
      'INTRODUCTION ............................ ',
      '12',
    ]);
    const [, number] = parts;
    expect((number?.x ?? 0) + (number?.width ?? 0)).toBeCloseTo(570, 6);
  });

  it('leaves a sentence, a trailing leader, and dots followed by more prose alone', () => {
    expect(leaderParts(run('An ordinary line of text.', 72, 700))).toHaveLength(1);
    expect(leaderParts(run('Judgment. ..............', 72, 700))).toHaveLength(1);
    const prose = run('She paused ........ and then went on speaking at length', 72, 700);
    expect(leaderParts(prose)).toHaveLength(1);
  });
});

describe('linesOf — a leader inside one run', () => {
  it('right-tabs the page number across a dot leader', () => {
    const [line] = linesOf([
      run('I.', 104, 700, { width: 7 }),
      run('INTRODUCTION ............................ 1', 131, 700, { width: 444 }),
    ]);
    expect(line?.cells.map((cell) => cell.runs.map((r) => r.text).join(''))).toEqual([
      'I. INTRODUCTION',
      '1',
    ]);
    expect(line?.cells[1]?.leader).toBe('dot');
    expect(line?.cells[1]?.right).toBeCloseTo(575, 6);
  });
});

describe('linesOf — a raised footnote reference', () => {
  it('keeps a mark raised 4.5 pt over 12 pt text on the line it marks', () => {
    const lines = linesOf([
      run('has alleged a complete defense', 104, 420.3, { width: 410 }),
      run('1', 515, 424.8, { sizePt: 8, width: 4 }),
      run('– and more,', 522, 420.3, { width: 41 }),
      run('the next line of the paragraph', 104, 396.3, { width: 300 }),
    ]);
    expect(lines).toHaveLength(2);
    const marks = lines[0]?.cells.flatMap((cell) => cell.runs).filter((r) => r.superscript);
    expect(marks?.map((mark) => mark.text.trim())).toEqual(['1']);
    expect(lines[0]?.baseline).toBe(420.3);
  });

  it('leaves a small line of its own a line of its own', () => {
    const lines = linesOf([
      run('a caption in small type', 104, 440, { sizePt: 8 }),
      run('the paragraph below it', 104, 420, { width: 300 }),
    ]);
    expect(lines).toHaveLength(2);
  });
});

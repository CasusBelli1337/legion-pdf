import { describe, expect, it } from 'vitest';
import { run } from './layout-testkit';
import { lineText, linesOf } from './lines';

describe('a caption’s column of ")"', () => {
  const paren = { ...run(')', 327, 600, { hidden: true, width: 3 }), ownCell: true };

  it('is a cell of its own, and so is the title a space after it', () => {
    const runs = [
      run('HARLAN FREIGHT COMPANY, a Delaware', 88, 600, { hidden: true, width: 228 }),
      paren,
      run('CROSS-COMPLAINT OF', 350, 600, { hidden: true, width: 138 }),
    ];
    const [line] = linesOf(runs);
    expect(lineText(line as never)).toBe(
      'HARLAN FREIGHT COMPANY, a Delaware\t)\tCROSS-COMPLAINT OF'
    );
    expect(line?.cells.map((cell) => cell.x)).toEqual([88, 327, 350]);
  });

  it('joins a parenthesis that is not marked to the words beside it', () => {
    const runs = [
      run('(the "Lease"', 88, 600, { hidden: true, width: 60 }),
      run(')', 148, 600, { hidden: true, width: 3 }),
    ];
    expect(linesOf(runs).map(lineText)).toEqual(['(the "Lease")']);
  });
});

describe('a recognised line’s cells', () => {
  const documentId = run('4417-0093-2206.1', 136, 114, { hidden: true, sizePt: 6, width: 52 });
  const number = run('- 2 -', 337, 114, { hidden: true, sizePt: 10.5, width: 17 });

  it('each keep their own size when they plainly differ: a foot’s document number and its page number', () => {
    const [line] = linesOf([documentId, number]);
    expect(line?.sizePt).toBe(6);
    expect(line?.cells.map((cell) => cell.runs[0]?.sizePt)).toEqual([6, 10.5]);
  });

  it('share the line’s size when they all but agree', () => {
    const near = { ...number, sizePt: 6.5 };
    const [line] = linesOf([documentId, near]);
    expect(line?.cells.map((cell) => cell.runs[0]?.sizePt)).toEqual([6, 6]);
  });

  it('leaves typed cells to their own runs', () => {
    const typed = [
      { ...documentId, hidden: false },
      { ...number, hidden: false },
    ];
    const [line] = linesOf(typed);
    expect(line?.cells.map((cell) => cell.runs[0]?.sizePt)).toEqual([6, 10.5]);
  });
});

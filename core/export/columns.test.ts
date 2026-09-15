import { describe, expect, it } from 'vitest';
import { columnsOf, findGutter } from './columns';
import { lineText, linesOf } from './lines';
import { run } from './layout-testkit';

const FRAME = { left: 72, right: 540, textRight: 540 };

/** Left column 72–270 (33 chars × 6), right column 342–540, three lines each. */
function twoColumns() {
  return [
    run('L1 '.padEnd(33, 'a'), 72, 700),
    run('R1 '.padEnd(33, 'b'), 342, 700),
    run('L2 '.padEnd(33, 'a'), 72, 686),
    run('R2 '.padEnd(33, 'b'), 342, 686),
    run('L3 '.padEnd(33, 'a'), 72, 672),
    run('R3 '.padEnd(33, 'b'), 342, 672),
  ];
}

describe('columnsOf and linesOf', () => {
  it('read the left column to its foot before the right column', () => {
    expect(columnsOf(twoColumns(), FRAME)).toHaveLength(2);
    const order = linesOf(twoColumns(), [], FRAME).map((line) => lineText(line).slice(0, 2));
    expect(order).toEqual(['L1', 'L2', 'L3', 'R1', 'R2', 'R3']);
  });

  it('read an ordinary page top to bottom', () => {
    const runs = [run('second', 72, 686), run('first', 72, 700), run('third', 72, 672)];
    expect(linesOf(runs, [], FRAME).map(lineText)).toEqual(['first', 'second', 'third']);
  });

  it('find no gutter when a heading spans both columns', () => {
    expect(findGutter([...twoColumns(), run('x'.repeat(78), 72, 720)], FRAME)).toBeNull();
  });

  it('find no gutter for a margin note beside the text', () => {
    expect(findGutter([run('x'.repeat(33), 72, 700), run('note', 342, 700)], FRAME)).toBeNull();
  });

  it('keep a narrow two-column table as tabular lines, not page columns', () => {
    const table = [
      run('Fee', 72, 700),
      run('$100', 300, 700),
      run('Costs', 72, 686),
      run('$250', 300, 686),
      run('Tax', 72, 672),
      run('$30', 300, 672),
    ];
    expect(findGutter(table, FRAME)).toBeNull();
    expect(linesOf(table, [], FRAME).map(lineText)).toEqual([
      'Fee\t$100',
      'Costs\t$250',
      'Tax\t$30',
    ]);
  });
});

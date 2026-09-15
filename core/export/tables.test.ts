import { describe, expect, it } from 'vitest';
import { linesOf } from './lines';
import { tabStopsOf } from './tables';
import { run } from './layout-testkit';

describe('tabStopsOf', () => {
  it('merges cell edges within a few points into one stop, measured from the frame', () => {
    const lines = linesOf([
      run('Fee', 72, 700),
      run('$100', 300, 700),
      run('Due', 450, 700),
      run('Costs', 72, 686),
      run('$250', 302, 686),
      run('Paid', 452, 686),
    ]);
    expect(tabStopsOf(lines, { left: 72, right: 540, textRight: 540 })).toEqual([228, 378]);
  });
});

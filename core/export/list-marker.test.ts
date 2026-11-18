import { describe, expect, it } from 'vitest';
import { run } from './layout-testkit';
import { lineText, linesOf } from './lines';

describe('the tab after a paragraph number', () => {
  it('opens a cell after "1." at a gap too narrow to be a column', () => {
    // 26 pt after a 12 pt marker: under the 2.2 em column gap, far over a word space.
    const [line] = linesOf([run('1.', 128, 693, { width: 10 }), run('I am a member', 164, 693)]);
    expect(lineText(line!)).toBe('1.\tI am a member');
    expect(line!.cells[1]!.x).toBe(164);
  });

  it.each(['12)', '(a)', 'iv.', 'b.', '•'])('reads %s as a marker', (marker) => {
    const [line] = linesOf([run(marker, 128, 693, { width: 14 }), run('the lease', 160, 693)]);
    expect(line!.cells).toHaveLength(2);
  });

  it('leaves an ordinary word space after a marker a space', () => {
    const [line] = linesOf([run('1.', 128, 693, { width: 10 }), run('I am a member', 141, 693)]);
    expect(lineText(line!)).toBe('1. I am a member');
  });

  it('leaves a heading’s number with its heading', () => {
    const [roman] = linesOf([run('IV.', 260, 693, { width: 16 }), run('CONCLUSION', 292, 693)]);
    expect(lineText(roman!)).toBe('IV. CONCLUSION');
    const [letter] = linesOf([run('A.', 128, 693, { width: 12 }), run('The Lease', 156, 693)]);
    expect(letter!.cells).toHaveLength(1);
  });

  it('does not take a short word or a mid-line gap for a marker and its tab', () => {
    const [word] = linesOf([run('No.', 128, 693, { width: 18 }), run('C22-01139', 162, 693)]);
    expect(word!.cells).toHaveLength(1);
    const [later] = linesOf([
      run('see item', 92, 693, { width: 44 }),
      run('1.', 139, 693, { width: 10 }),
      run('and so on', 165, 693),
    ]);
    expect(later!.cells).toHaveLength(1);
  });
});

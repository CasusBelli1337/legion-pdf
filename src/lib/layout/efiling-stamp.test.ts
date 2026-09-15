import { describe, expect, it } from 'vitest';
import type { LayoutTextRun } from '@shared/types';
import { stampRunIndexes } from './efiling-stamp';

function run(text: string, x: number, y: number, fontKey = 'body'): LayoutTextRun {
  return { text, x, y, width: text.length * 5, sizePt: 12, fontKey, role: 'body', eol: false };
}

const size = { width: 612, height: 792 };

describe('stampRunIndexes', () => {
  it('finds the e-filing stamp in the top-right corner, in its own face, over several lines', () => {
    const runs = [
      run('Steven A. Ellenberg, Bar No. 151489', 104, 716),
      run('steven.ellenberg@lathropgpm.com', 104, 704),
      run('LATHROP GPM LLP', 104, 692),
      run('El', 397, 714, 'arialBold'),
      run('ectronically Fi', 408, 714, 'arialBold'),
      run('led', 470, 714, 'arialBold'),
      run('by Superior Court of CA,', 397, 704, 'arialBold'),
      run('County of Santa Clara, on 8/28/2025', 397, 694, 'arialBold'),
      run('Envelope: 80933353', 397, 684, 'arialBold'),
    ];
    const indexes = stampRunIndexes(runs, size);
    expect([...indexes].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('leaves a right-aligned date or case number alone: one line is not a stamp', () => {
    const runs = [run('Body text', 104, 716), run('Case No. 24CV412887', 400, 716, 'bold')];
    expect(stampRunIndexes(runs, size).size).toBe(0);
  });

  it('leaves a corner block alone when it does not read like a filing stamp', () => {
    const runs = [
      run('Body text', 104, 716),
      run('DRAFT', 420, 716, 'arialBold'),
      run('NOT FOR', 420, 704, 'arialBold'),
      run('DISTRIBUTION', 420, 692, 'arialBold'),
    ];
    expect(stampRunIndexes(runs, size).size).toBe(0);
  });
});

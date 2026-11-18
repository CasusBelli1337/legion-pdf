import { describe, expect, it } from 'vitest';
import type { LayoutTextRun } from '@shared/types';
import { reclaimTaggedBody } from './tagged-body';

function run(
  text: string,
  y: number,
  role: LayoutTextRun['role'],
  blockId?: string,
  sizePt = 12
): LayoutTextRun {
  return {
    text,
    x: 104,
    y,
    width: 300,
    sizePt,
    fontKey: 'f1',
    colorHex: '#000000',
    role,
    eol: true,
    ...(blockId === undefined ? {} : { block: { id: blockId, role: 'paragraph' } }),
  };
}

describe('reclaimTaggedBody', () => {
  it('returns a footnote’s last line to the body when the classifier filed it as a footer', () => {
    const runs = [
      run('a footnote that runs to the foot of the page and', 70, 'body', 'b13'),
      run('ends on this line.', 56, 'footer', 'b13'),
      run('REPLY IN SUPPORT OF MOTION', 29, 'footer'),
    ];
    reclaimTaggedBody(runs);
    expect(runs.map((entry) => entry.role)).toEqual(['body', 'body', 'footer']);
  });

  it('returns a whole footnote filed as a footer: the page’s real foot is untagged', () => {
    const runs = [
      run('The last line of the body.', 112, 'body', 'b45'),
      run('1', 80, 'footer', 'b44', 8),
      run('Interrogatories Nos. 3 through 9 share the terms.', 77, 'footer', 'b44', 10),
      run('2', 48, 'page-number'),
      run('OPPOSITION TO MOTION TO COMPEL', 38, 'footer'),
    ];
    reclaimTaggedBody(runs);
    expect(runs.map((entry) => entry.role)).toEqual([
      'body',
      'body',
      'body',
      'page-number',
      'footer',
    ]);
  });

  it('leaves a tagged running foot alone where nothing shows the producer leaves feet untagged', () => {
    const runs = [
      run('The last line of the body.', 300, 'body', 'b1'),
      run('Confidential — Subject to Protective Order', 30, 'footer', 'b9'),
    ];
    reclaimTaggedBody(runs);
    expect(runs[1]?.role).toBe('footer');
  });

  it('follows a chain of footnote lines down from the body', () => {
    const runs = [
      run('footnote three, last line', 70.4, 'body', 'b10'),
      run('4', 61.1, 'footer', 'b16', 8),
      run('footnote four, a single line under it', 56.6, 'footer', 'b16'),
    ];
    reclaimTaggedBody(runs);
    expect(runs.every((entry) => entry.role === 'body')).toBe(true);
  });
});

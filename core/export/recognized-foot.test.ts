import { describe, expect, it } from 'vitest';
import type { LayoutTextRun } from '@shared/types';
import { page, run } from './layout-testkit';
import { attendsPageNumber, withCommonNumberStyle } from './recognized-foot';

const scanned = { hidden: true, sizePt: 9 };

describe('attendsPageNumber', () => {
  const number = run('1', 324, 33, { ...scanned, role: 'page-number', width: 2 });
  const before = run('-', 318, 33, { ...scanned, role: 'footer', width: 3 });
  const after = run('-', 330, 33, { ...scanned, role: 'footer', width: 3 });

  it('keeps the dashes of "- 1 -" that recognition handed over as pieces', () => {
    const sheet = page([number, before, after]);
    expect(attendsPageNumber(before, sheet)).toBe(true);
    expect(attendsPageNumber(after, sheet)).toBe(true);
  });

  it('does not keep a dash anywhere else on the foot', () => {
    const far = run('-', 140, 33, { ...scanned, role: 'footer', width: 3 });
    const above = run('-', 330, 60, { ...scanned, role: 'footer', width: 3 });
    const sheet = page([number, far, above]);
    expect(attendsPageNumber(far, sheet)).toBe(false);
    expect(attendsPageNumber(above, sheet)).toBe(false);
  });

  it('adds no dash to a number already read with its own', () => {
    const whole = { ...number, text: '- 1 -', x: 318, width: 15 };
    expect(attendsPageNumber(after, page([whole, after]))).toBe(false);
  });

  it('leaves typed punctuation and other marks to the usual rules', () => {
    const typed = { ...after, hidden: false };
    const mark = { ...after, text: ')' };
    const sheet = page([number, typed, mark]);
    expect(attendsPageNumber(typed, sheet)).toBe(false);
    expect(attendsPageNumber(mark, sheet)).toBe(false);
  });
});

describe('withCommonNumberStyle', () => {
  const numberOn = (fontKey: string, sizePt: number): LayoutTextRun =>
    run('3', 300, 48, { hidden: true, role: 'page-number', fontKey, sizePt });
  const plain = [page([numberOn('times', 12)]), page([numberOn('times', 12)])];
  const bold = numberOn('timesBold', 13);

  it('prints the number in the face and size most pages read it in', () => {
    const title = run('ORDER', 200, 60, { hidden: true, role: 'footer', sizePt: 9 });
    const band = withCommonNumberStyle([title, bold], [page([bold]), ...plain]);
    expect(band[1]).toMatchObject({ fontKey: 'times', sizePt: 12, text: '3' });
    expect(band[0]).toBe(title);
  });

  it('leaves a typed number as the file set it', () => {
    const typed = { ...bold, hidden: false };
    expect(withCommonNumberStyle([typed], plain)).toEqual([typed]);
  });
});

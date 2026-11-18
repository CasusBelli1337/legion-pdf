import { describe, expect, it } from 'vitest';
import { run } from './layout-testkit';
import { isMarginRun, slugScale, splitMarginRuns } from './margin-slug';
import type { BodyFrame, StyledRun } from './model';

const FRAME: BodyFrame = { left: 104, right: 576, textRight: 576 };

function styledRun(text: string, sizePt: number): StyledRun {
  return { text, fontKey: 'times', sizePt, colorHex: '000000', underline: false, hidden: false };
}

describe('margin slug — a firm’s name set in the margin beside the foot', () => {
  it('tells a run set wholly in the left margin from one that starts in it', () => {
    expect(isMarginRun(run('HARTWELL LLP', 18, 53, { sizePt: 7, width: 66 }), FRAME)).toBe(true);
    // A document number that begins a few points left of the body is the foot's own line.
    expect(isMarginRun(run('80000001v1', 99, 53, { sizePt: 8, width: 40 }), FRAME)).toBe(false);
  });

  it('splits the slug from the foot’s own lines', () => {
    const slug = run('HARTWELL LLP', 18, 53, { sizePt: 7, width: 66 });
    const title = run('OPPOSITION TO MOTION', 104, 41, { sizePt: 10 });
    const { margin, main } = splitMarginRuns([slug, title], FRAME);
    expect(margin).toEqual([slug]);
    expect(main).toEqual([title]);
  });

  it('keeps a foot that sits wholly in the margin as an ordinary foot', () => {
    const slug = run('HARTWELL LLP', 18, 53, { sizePt: 7, width: 66 });
    expect(splitMarginRuns([slug], FRAME)).toEqual({ margin: [], main: [slug] });
  });

  it('squeezes letter-spaced capitals that would not fit the margin, and nothing that fits', () => {
    expect(slugScale([styledRun('Hartwell', 7)], 80)).toBe(100);
    const spaced = [styledRun('S A N J O S E  R E D W O O D C I T Y', 5)];
    const scale = slugScale(spaced, 60);
    expect(scale).toBeLessThan(100);
    expect(scale).toBeGreaterThanOrEqual(50);
  });
});

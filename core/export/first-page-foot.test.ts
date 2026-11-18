import { describe, expect, it } from 'vitest';
import { firstPageDiffers, pageNumberStart } from './first-page-foot';
import { page, run } from './layout-testkit';

function sheet(index: number, printed: number | null) {
  const foot = run('MEMORANDUM OF POINTS AND AUTHORITIES', 105, 30, { role: 'footer', sizePt: 10 });
  const number = printed === null ? [] : [run(`- ${printed} -`, 300, 46, { role: 'page-number' })];
  return page([run('Body text.', 72, 700), foot, ...number], {
    page: index,
    printedPageNumber: printed,
  });
}

describe('firstPageDiffers', () => {
  it('is true when only the first page goes unnumbered and the rest print their place', () => {
    expect(firstPageDiffers([sheet(1, null), sheet(2, 2), sheet(3, 3)])).toBe(true);
  });

  it('is false when the first page is numbered, a later page is not, or the numbers restart', () => {
    expect(firstPageDiffers([sheet(1, 1), sheet(2, 2)])).toBe(false);
    expect(firstPageDiffers([sheet(1, null), sheet(2, null), sheet(3, 3)])).toBe(false);
    expect(firstPageDiffers([sheet(1, null), sheet(2, 1), sheet(3, 2)])).toBe(false);
    expect(firstPageDiffers([sheet(1, null)])).toBe(false);
  });
});

describe('pageNumberStart', () => {
  it('starts an excerpt where its pages printed it', () => {
    expect(pageNumberStart([sheet(1, 45), sheet(2, 46)])).toBe(45);
  });

  it('counts back from the first numbered page to the section’s first page', () => {
    expect(pageNumberStart([sheet(4, null), sheet(5, 2), sheet(6, 3)])).toBe(1);
  });

  it('says nothing for a section with no printed number', () => {
    expect(pageNumberStart([sheet(1, null), sheet(2, null)])).toBeUndefined();
  });
});

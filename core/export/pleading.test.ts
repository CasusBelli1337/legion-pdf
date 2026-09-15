import { describe, expect, it } from 'vitest';
import { pleadingOf } from './pleading';
import { page, run } from './layout-testkit';

function pleadingPage(count = 28) {
  const numbers = Array.from({ length: count }, (_unused, index) =>
    run(String(index + 1), 54, 720 - index * 24, { sizePt: 10, role: 'line-number', width: 5 })
  );
  return page(numbers);
}

describe('pleadingOf', () => {
  it('reads the pitch and the column edge off 28 numbered lines', () => {
    const pleading = pleadingOf(pleadingPage());
    expect(pleading).not.toBeNull();
    expect(pleading?.pitchPt).toBe(24);
    expect(pleading?.numberRight).toBe(59);
    expect(pleading?.count).toBe(28);
    expect(pleading?.firstBaseline).toBe(720);
  });

  it('is null for a short numbered list, and for a stack of mini-pages', () => {
    expect(pleadingOf(pleadingPage(6))).toBeNull();
    expect(pleadingOf(pleadingPage(50))).toBeNull();
  });

  it('is null when the numbers are not in one column', () => {
    const scattered = page(
      Array.from({ length: 24 }, (_unused, index) =>
        run(String(index + 1), 54 + index * 10, 720 - index * 24, { role: 'line-number' })
      )
    );
    expect(pleadingOf(scattered)).toBeNull();
  });
});

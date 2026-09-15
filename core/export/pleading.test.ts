import { describe, expect, it } from 'vitest';
import { pleadingOf, pleadingOfSection } from './pleading';
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

describe('pleadingOf — rules, grid, and what is not a column', () => {
  function numbered(extra: Partial<Parameters<typeof page>[1]> = {}) {
    const numbers = Array.from({ length: 28 }, (_unused, index) =>
      run(String(index + 1), 54, 720 - index * 24, { sizePt: 12, role: 'line-number', width: 6 })
    );
    return page([...numbers, run('Body text on line one', 90, 720)], extra);
  }

  it('reads a double rule beside the numbers and a single rule at the right edge', () => {
    const rules = [
      { rect: { x: 64, y: 20, width: 0.7, height: 750 } },
      { rect: { x: 65.5, y: 20, width: 0.7, height: 750 } },
      { rect: { x: 580, y: 20, width: 0.5, height: 750 } },
    ];
    const pleading = pleadingOf(numbered({ rules }));
    expect(pleading?.rules).toMatchObject({ inner: 'double', right: 'single' });
    expect(pleading?.rules.innerX).toBeCloseTo(65.1, 1);
    expect(pleading?.rules.rightX).toBeCloseTo(580.25, 1);
  });

  it('ignores short rules and horizontal rules', () => {
    const rules = [
      { rect: { x: 64, y: 300, width: 0.7, height: 100 } },
      { rect: { x: 90, y: 40, width: 400, height: 0.7 } },
    ];
    expect(pleadingOf(numbered({ rules }))?.rules).toMatchObject({ inner: 'none', right: 'none' });
  });

  it('calls a fixed pitch a grid and numbers that follow the text not a grid', () => {
    expect(pleadingOf(numbered())?.grid).toBe(true);
    const following = Array.from({ length: 20 }, (_unused, index) =>
      run(String(index + 1), 54, 720 - (index < 8 ? index * 12 : 96 + (index - 8) * 24), {
        role: 'line-number',
        width: 6,
      })
    );
    const pleading = pleadingOf(page([...following, run('Body', 90, 720)]));
    expect(pleading).not.toBeNull();
    expect(pleading?.grid).toBe(false);
  });

  it('fits line 1 through every number, so a missing number 1 (OCR) still places the grid', () => {
    const numbers = Array.from({ length: 27 }, (_unused, index) =>
      run(String(index + 2), 54, 696 - index * 24, { role: 'line-number', width: 6 })
    );
    const pleading = pleadingOf(page([...numbers, run('Body', 90, 696)]));
    expect(pleading?.firstBaseline).toBeCloseTo(720, 3);
    expect(pleading?.count).toBe(28);
  });

  it('is not fooled by whitespace runs left of the numbers, but refuses a list inside the body', () => {
    expect(pleadingOf(page([...numbered().runs, run(' ', 56, 600)]))).not.toBeNull();
    const list = Array.from({ length: 12 }, (_unused, index) =>
      run(String(index + 1), 120, 700 - index * 24, { role: 'line-number', width: 6 })
    );
    expect(
      pleadingOf(
        page([
          ...list,
          run('Item text', 140, 700),
          ...[730, 250, 226].map((y) => run('A full line of body text left of the list', 90, y)),
        ])
      )
    ).toBeNull();
  });
});

describe('pleadingOfSection', () => {
  it('takes the median geometry and the largest count across the pages', () => {
    const full = Array.from({ length: 28 }, (_unused, index) =>
      run(String(index + 1), 54, 720 - index * 24, { role: 'line-number', width: 6 })
    );
    const partial = Array.from({ length: 24 }, (_unused, index) =>
      run(String(index + 1), 54.5, 720.4 - index * 24, { role: 'line-number', width: 6 })
    );
    const section = pleadingOfSection([
      page([...full, run('Body', 90, 720)]),
      page([...partial, run('Body', 90, 720)], { page: 2 }),
    ]);
    expect(section?.count).toBe(28);
    expect(section?.pitchPt).toBeCloseTo(24, 3);
    expect(section?.firstBaseline).toBeCloseTo(720.2, 1);
    expect(pleadingOfSection([page([run('No numbers here', 90, 700)])])).toBeNull();
  });
});

describe('pleadingOf — what an OCR makes of a numbered column', () => {
  it('fits the grid past a misread number and a few scraps left of the column', () => {
    const numbers = [12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28].map((value) =>
      run(String(value), 74, 720 - (value - 1) * 24, {
        role: 'line-number',
        width: 12,
        hidden: true,
      })
    );
    // "11" read as "1": a value of 1 sitting where line 11 is.
    const misread = run('1', 80, 720 - 10 * 24, { role: 'line-number', width: 6, hidden: true });
    const scraps = [run('10', 76, 500, { hidden: true }), run('i7', 76, 332, { hidden: true })];
    const body = run('Recognized body text of the page', 104, 696, { hidden: true });
    const pleading = pleadingOf(page([...numbers, misread, ...scraps, body]));
    expect(pleading).not.toBeNull();
    expect(pleading?.grid).toBe(true);
    expect(pleading?.firstBaseline).toBeCloseTo(720, 1);
    expect(pleading?.pitchPt).toBeCloseTo(24, 2);
    expect(pleading?.count).toBe(28);
  });
});

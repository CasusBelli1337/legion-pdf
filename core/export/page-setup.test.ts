import { describe, expect, it } from 'vitest';
import {
  bodyExtents,
  groupSections,
  pageSizeOf,
  sectionGeometry,
  withVerticalMargins,
} from './page-setup';
import { page, paragraphLines, run } from './layout-testkit';

describe('pageSizeOf', () => {
  it('swaps width and height for a page rotated a quarter turn', () => {
    expect(pageSizeOf(page([], { rotation: 90 }))).toEqual({ width: 792, height: 612 });
    expect(pageSizeOf(page([], { rotation: 0 }))).toEqual({ width: 612, height: 792 });
  });
});

describe('groupSections', () => {
  it('puts consecutive same-size pages in one section and a landscape page in its own', () => {
    const letter = page([]);
    const landscape = page([], { size: { width: 792, height: 612 } });
    expect(groupSections([letter, letter, landscape, letter]).map((s) => s.length)).toEqual([
      2, 1, 1,
    ]);
  });
});

describe('groupSections by columns', () => {
  it('gives a two-column page its own section', () => {
    const single = page(paragraphLines(3, 700));
    const twoColumn = page(
      Array.from({ length: 6 }, (_unused, index) =>
        run(
          (index % 2 === 0 ? 'L' : 'R').padEnd(33, 'x'),
          index % 2 === 0 ? 72 : 342,
          700 - Math.floor(index / 2) * 14
        )
      ),
      { page: 2 }
    );
    expect(groupSections([single, twoColumn, single]).map((s) => s.length)).toEqual([1, 1, 1]);
    const geometry = sectionGeometry([twoColumn]);
    expect(geometry.columns).toMatchObject({ count: 2, secondLeft: 342 });
    expect(geometry.columns.widths[0]).toBe(200);
    expect(geometry.columns.spacePt).toBe(70);
  });
});

describe('sectionGeometry', () => {
  it('reads the left margin off the widest body text on any page', () => {
    const wide = page(paragraphLines(3, 700, { x: 72 }));
    const narrow = page(paragraphLines(3, 650, { x: 90 }), { page: 2 });
    const geometry = sectionGeometry([wide, narrow]);
    expect(geometry.margins.left).toBe(72);
    expect(geometry.frame.left).toBe(72);
    expect(geometry.orientation).toBe('portrait');
  });

  it('keeps the right margin no wider than the left, with two points of slack', () => {
    // The widest line ends at 72 + 68 × 6 = 480: the text says 132, the left says 72.
    const geometry = sectionGeometry([page(paragraphLines(3, 700))]);
    expect(geometry.margins.right).toBe(70);
    expect(geometry.frame.right).toBe(542);
    expect(geometry.frame.textRight).toBe(480);
  });

  it('never goes under half an inch on the left or a quarter on the right, and defaults to an inch with no body text', () => {
    const cramped = page([run('x'.repeat(100), 10, 780, { width: 592 })]);
    const geometry = sectionGeometry([cramped]);
    expect(geometry.margins.left).toBe(36);
    // The right margin only has to let the widest line through, so it may be tighter.
    expect(geometry.margins.right).toBe(18);
    expect(sectionGeometry([page([])]).margins).toEqual({
      top: 72,
      right: 72,
      bottom: 72,
      left: 72,
    });
  });

  it('settles the top margin exactly and caps the bottom', () => {
    const geometry = withVerticalMargins(sectionGeometry([page(paragraphLines(2, 700))]), [
      { top: 741.6, bottom: 400 },
      { top: 730, bottom: 60 },
    ]);
    expect(geometry.margins.top).toBeCloseTo(792 - 741.6);
    expect(geometry.margins.bottom).toBe(58);
    const roomy = withVerticalMargins(sectionGeometry([page([])]), [{ top: 700, bottom: 500 }]);
    expect(roomy.margins.bottom).toBe(70);
  });

  it('places the header and footer bands where the running head and foot sat', () => {
    const layout = page([
      run('RUNNING HEAD', 90, 760, { sizePt: 9, role: 'header' }),
      ...paragraphLines(3, 700),
      run('3', 300, 44, { sizePt: 10, role: 'page-number' }),
    ]);
    const geometry = sectionGeometry([layout]);
    expect(geometry.headerPt).toBeCloseTo(792 - (760 + 0.8 * 9));
    expect(geometry.footerPt).toBeCloseTo(44 - 0.25 * 10);
  });

  it('ignores headers, footers, and line numbers when measuring the body', () => {
    const layout = page([
      run('1', 54, 720, { role: 'line-number' }),
      ...paragraphLines(2, 720, { x: 90 }),
    ]);
    expect(bodyExtents(layout)?.left).toBe(90);
  });
});

import { describe, expect, it } from 'vitest';
import type { LayoutRule } from '@shared/types';
import { componentsOf, gridOf, gridsOf } from './table-grid';

/** A rule as the operator walk reports one: a thin box, PDF coordinates. */
function rule(x: number, y: number, width: number, height: number): LayoutRule {
  return { rect: { x, y, width, height } };
}

/** A stroked line has no thickness of its own in the operator list. */
function horizontal(x: number, y: number, width: number): LayoutRule {
  return rule(x, y, width, 0);
}

function vertical(x: number, y: number, height: number): LayoutRule {
  return rule(x, y, 0, height);
}

/** A caption box: 3 rows, 2 columns, every edge drawn. */
const CAPTION: LayoutRule[] = [
  horizontal(72, 700, 468),
  horizontal(72, 660, 468),
  horizontal(72, 620, 468),
  horizontal(72, 580, 468),
  vertical(72, 580, 120),
  vertical(306, 580, 120),
  vertical(540, 580, 120),
];

describe('gridOf', () => {
  it('reads a 3 × 2 caption box: column edges left to right, row edges top down', () => {
    const grid = gridOf(CAPTION);
    expect(grid?.columnEdges).toEqual([72, 306, 540]);
    expect(grid?.rowEdges).toEqual([700, 660, 620, 580]);
    expect(grid?.borders.horizontal).toEqual([
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ]);
    expect(grid?.borders.vertical).toEqual([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
  });

  it('measures a filled rule from its middle, and joins one broken at a crossing', () => {
    const grid = gridOf([
      rule(72, 699.5, 234, 1),
      rule(306, 699.5, 234, 1),
      rule(72, 659.5, 468, 1),
      rule(72, 619.5, 468, 1),
      rule(305.5, 619.5, 1, 81),
      rule(71.5, 619.5, 1, 81),
      rule(539.5, 619.5, 1, 81),
    ]);
    expect(grid?.rowEdges).toEqual([700, 660, 620]);
    expect(grid?.columnEdges).toEqual([72, 306, 540]);
    expect(grid?.borders.horizontal[0]).toEqual([true, true]);
  });

  it('finds the grid of a three-sided box and reports the left edge as undrawn', () => {
    const isLeftRule = (candidate: LayoutRule) =>
      candidate.rect.width === 0 && candidate.rect.x === 72;
    const grid = gridOf(CAPTION.filter((candidate) => !isLeftRule(candidate)));
    expect(grid?.columnEdges).toEqual([72, 306, 540]);
    expect(grid?.rowEdges).toEqual([700, 660, 620, 580]);
    expect(grid?.borders.vertical).toEqual([
      [false, true, true],
      [false, true, true],
      [false, true, true],
    ]);
    // The horizontals are all still drawn — the box is open on the left only.
    expect(grid?.borders.horizontal.every((row) => row.every(Boolean))).toBe(true);
  });

  it('records a row divider that stops short of the last column as undrawn there', () => {
    const short = CAPTION.filter((candidate) => candidate.rect.y !== 660);
    const grid = gridOf([...short, horizontal(72, 660, 400)]);
    expect(grid?.rowEdges).toEqual([700, 660, 620, 580]);
    expect(grid?.borders.horizontal[1]).toEqual([true, false]);
  });

  it('is not a table with only one row', () => {
    expect(
      gridOf([horizontal(72, 700, 468), horizontal(72, 660, 468), vertical(306, 660, 40)])
    ).toBeNull();
  });

  it('is not a table with only one column: a ruled-off block of text', () => {
    expect(
      gridOf([horizontal(72, 700, 468), horizontal(72, 660, 468), horizontal(72, 620, 468)])
    ).toBeNull();
  });

  it('ignores an underline: too short to be an edge of anything', () => {
    expect(gridOf([...CAPTION, horizontal(80, 688, 60)])?.rowEdges).toEqual([700, 660, 620, 580]);
  });

  it('is not a table when pleading paper rules its own margin', () => {
    // Two vertical rules six points apart beside the numbers, and rules above
    // and below the type block: they cross, but no column of a table is six
    // points wide, and the filing's caption must not be swallowed by one.
    const pleading = [
      horizontal(60, 720, 480),
      horizontal(60, 680, 480),
      horizontal(60, 100, 480),
      vertical(60, 100, 620),
      vertical(66, 100, 620),
    ];
    expect(gridOf(pleading)).toBeNull();
  });

  it('keeps a narrow column that is still wide enough to hold a character', () => {
    const narrow = [
      horizontal(72, 700, 468),
      horizontal(72, 660, 468),
      horizontal(72, 620, 468),
      vertical(72, 620, 80),
      vertical(92, 620, 80),
      vertical(540, 620, 80),
    ];
    expect(gridOf(narrow)?.columnEdges).toEqual([72, 92, 540]);
  });

  it('ignores a filled panel — a rule is thin', () => {
    expect(gridOf([rule(72, 580, 468, 120)])).toBeNull();
  });
});

describe('componentsOf', () => {
  it('keeps two tables and a stray underline apart', () => {
    const service = [
      horizontal(72, 300, 468),
      horizontal(72, 260, 468),
      horizontal(72, 220, 468),
      vertical(72, 220, 80),
      vertical(300, 220, 80),
      vertical(540, 220, 80),
    ];
    const components = componentsOf([...CAPTION, ...service, horizontal(80, 500, 60)]);
    expect(components.map((group) => group.length).sort((a, b) => a - b)).toEqual([1, 6, 7]);
  });
});

describe('gridsOf', () => {
  it('returns every grid on the page, the topmost first', () => {
    const lower = [
      horizontal(72, 300, 468),
      horizontal(72, 260, 468),
      horizontal(72, 220, 468),
      vertical(72, 220, 80),
      vertical(300, 220, 80),
      vertical(540, 220, 80),
    ];
    const grids = gridsOf([...lower, ...CAPTION, horizontal(80, 500, 60)]);
    expect(grids.map((grid) => grid.rowEdges[0])).toEqual([700, 300]);
  });

  it('finds nothing on a page of underlines', () => {
    expect(gridsOf([horizontal(80, 688, 60), horizontal(80, 640, 120)])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { LayoutRule, LayoutTextRun } from '@shared/types';
import { captionGridOf } from './caption-box';
import { run } from './layout-testkit';
import { lineText, linesOf } from './lines';
import type { BodyFrame } from './model';
import { ruledTablesOf } from './tables';

function rule(x: number, y: number, width: number, height: number): LayoutRule {
  return { rect: { x, y, width, height } };
}

const FRAME: BodyFrame = { left: 72, right: 540, textRight: 540 };
/** One upright rule from y 580 to 700, one rule under the left cell. */
const L_CAPTION: LayoutRule[] = [rule(306, 580, 0, 120), rule(72, 580, 234, 0)];

const column = (texts: string[], x: number, top: number, pitch: number, hidden = false) =>
  texts.map((text, index) => run(text, x, top - index * pitch, { hidden }));

/** A court's own order: three lines of parties beside five of title. */
const ORDER: LayoutTextRun[] = [
  ...column(['In the Matter of:', 'The Harlan Family Trust dated', 'March 3, 2011,'], 80, 684, 36),
  ...column(
    ['Case No. 22PR000417', '(lead case)', 'ORDER ON MATTER', 'TAKEN UNDER', 'SUBMISSION'],
    316,
    690,
    22
  ),
];

function gridOf(runs: LayoutTextRun[], rules: LayoutRule[] = L_CAPTION) {
  return captionGridOf(rules, linesOf(runs, rules), FRAME);
}

describe('captionGridOf', () => {
  it('reads a short caption whose few lines run most of the rule’s height', () => {
    const grid = gridOf(ORDER);
    // The right cell ends two points past its longest line: nineteen characters from x 316.
    expect(grid?.columnEdges).toEqual([72, 306, 432]);
    expect(grid?.rowEdges.at(-1)).toBe(580);
  });

  it('is not a caption when a few lines sit at the top of a long rule', () => {
    const top = ORDER.filter((item) => item.y > 640);
    expect(gridOf(top)).toBeNull();
  });

  it('is not a caption with a single line on one side', () => {
    const lopsided = ORDER.filter((item) => item.x > 300 || item.y === 684);
    expect(gridOf(lopsided)).toBeNull();
  });

  it('makes a row of the rule a caption draws between one set of parties and the next', () => {
    const rules = [...L_CAPTION, rule(72, 640, 234, 0)];
    const grid = gridOf(ORDER, rules);
    expect(grid?.rowEdges.slice(1)).toEqual([640, 580]);
    expect(grid?.borders).toEqual({
      horizontal: [
        [false, false],
        [true, false],
        [true, false],
      ],
      vertical: [
        [false, true, false],
        [false, true, false],
      ],
    });
    const { tables } = ruledTablesOf(linesOf(ORDER, rules), rules, FRAME);
    expect(tables[0]?.cells.map((row) => row[0]?.lines.map(lineText))).toEqual([
      ['In the Matter of:', 'The Harlan Family Trust dated'],
      ['March 3, 2011,'],
    ]);
  });

  it('ends the box under the last line’s own box when the line sits on the foot rule', () => {
    const onFoot = [...ORDER, run('a California corporation;', 80, 579)];
    const grid = gridOf(onFoot);
    const { tables, consumed } = ruledTablesOf(linesOf(onFoot, L_CAPTION), L_CAPTION, FRAME);
    expect(grid?.rowEdges.at(-1)).toBeLessThan(579 - 2);
    expect(tables[0]?.cells[0]?.[0]?.lines.map(lineText)).toContain('a California corporation;');
    expect(consumed.size).toBe(linesOf(onFoot, L_CAPTION).length);
  });

  it('gives a scan’s right cell the whole margin, and typed text only its own width', () => {
    const scanned = ORDER.map((item) => ({ ...item, hidden: true }));
    expect(gridOf(scanned)?.columnEdges).toEqual([72, 306, 540]);
  });
});

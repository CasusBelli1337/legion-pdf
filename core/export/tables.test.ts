import { describe, expect, it } from 'vitest';
import type { LayoutRule, LayoutTextRun } from '@shared/types';
import { lineText, linesOf } from './lines';
import type { BodyFrame } from './model';
import { ruledTablesOf, tabStopsOf } from './tables';
import { run } from './layout-testkit';

/** A rule as the operator walk reports one: a thin box, PDF coordinates. */
function rule(x: number, y: number, width: number, height: number): LayoutRule {
  return { rect: { x, y, width, height } };
}

const FRAME: BodyFrame = { left: 72, right: 540, textRight: 540 };

/** A caption box at the left margin: 3 rows, 2 columns, every edge drawn. */
const CAPTION: LayoutRule[] = [
  rule(72, 700, 468, 0),
  rule(72, 660, 468, 0),
  rule(72, 620, 468, 0),
  rule(72, 580, 468, 0),
  rule(72, 580, 0, 120),
  rule(306, 580, 0, 120),
  rule(540, 580, 0, 120),
];

/** The same box, ruled a full inch in from the margin. */
const INSET: LayoutRule[] = [
  rule(144, 700, 396, 0),
  rule(144, 660, 396, 0),
  rule(144, 620, 396, 0),
  rule(144, 580, 396, 0),
  rule(144, 580, 0, 120),
  rule(378, 580, 0, 120),
  rule(540, 580, 0, 120),
];

const CAPTION_RUNS: LayoutTextRun[] = [
  run('JANE DOE, Plaintiff,', 80, 690),
  run('Case No. 24-CV-0001', 316, 690),
  run('v.', 80, 645),
  run('PROOF OF SERVICE', 316, 645),
  run('JOHN ROE, Defendant.', 80, 600),
  run('Dept. 21', 316, 600),
];

/** The commonest caption box: one upright rule, one rule under the left cell. */
const L_CAPTION: LayoutRule[] = [rule(306, 580, 0, 120), rule(72, 580, 234, 0)];

const L_LEFT = [
  'JANE DOE, an individual,',
  'Plaintiff,',
  'vs.',
  'ACME HOLDINGS, LLC, and',
  'DOES 1 through 20,',
  'inclusive,',
  'Defendants.',
];
const L_RIGHT = [
  'Case No. 24-CV-0001',
  'NOTICE OF MOTION AND',
  'MOTION TO COMPEL',
  'Date: October 14, 2026',
  'Time: 9:00 a.m.',
  'Dept.: 21',
  'Judge: Hon. A. Reyes',
];
const L_RUNS: LayoutTextRun[] = L_LEFT.flatMap((text, index) => [
  run(text, 80, 690 - index * 12),
  run(L_RIGHT[index] ?? '', 316, 690 - index * 12),
]);

function tablesOf(runs: LayoutTextRun[], rules: LayoutRule[] = CAPTION, frame = FRAME) {
  const lines = linesOf(runs, rules);
  return { lines, ...ruledTablesOf(lines, rules, frame) };
}

describe('ruledTablesOf', () => {
  it('rebuilds a caption box: edges from the frame, rows top down, every line in its cell', () => {
    const { tables, consumed } = tablesOf(CAPTION_RUNS);
    const table = tables[0];
    expect(tables).toHaveLength(1);
    expect(table?.columnEdges).toEqual([0, 234, 468]);
    expect(table?.rowEdges).toEqual([700, 660, 620, 580]);
    expect(table?.top).toBe(700);
    expect(table?.bottom).toBe(580);
    expect(table?.cells.map((row) => row.map((cell) => cell.lines.map(lineText)))).toEqual([
      [['JANE DOE, Plaintiff,'], ['Case No. 24-CV-0001']],
      [['v.'], ['PROOF OF SERVICE']],
      [['JOHN ROE, Defendant.'], ['Dept. 21']],
    ]);
    expect(consumed.size).toBe(3);
  });

  it('measures a cell line from the frame too, so the cell can be laid out on its own', () => {
    const { tables } = tablesOf(CAPTION_RUNS);
    expect(tables[0]?.cells[0]?.[1]?.lines[0]?.x).toBe(316 - FRAME.left);
    expect(tables[0]?.cells[0]?.[0]?.lines[0]?.cells[0]?.x).toBe(80 - FRAME.left);
  });

  it('keeps several lines of one cell in reading order', () => {
    const { tables } = tablesOf([
      ...CAPTION_RUNS,
      run('and DOE COMPANIES 1-10,', 80, 675),
      run('Assigned for all purposes', 316, 675),
    ]);
    expect(tables[0]?.cells[0]?.[0]?.lines.map(lineText)).toEqual([
      'JANE DOE, Plaintiff,',
      'and DOE COMPANIES 1-10,',
    ]);
  });

  it('builds a three-sided box the same way — the model says which edges were drawn', () => {
    const open = CAPTION.filter((edge) => !(edge.rect.width === 0 && edge.rect.x === 72));
    const { tables } = tablesOf(CAPTION_RUNS, open);
    expect(tables[0]?.columnEdges).toEqual([0, 234, 468]);
    expect(tables[0]?.borders.vertical[0]).toEqual([false, true, true]);
    expect(tables[0]?.cells[2]?.[1]?.lines.map(lineText)).toEqual(['Dept. 21']);
  });

  it('leaves the lines above and below the box in the flow', () => {
    const { tables, consumed } = tablesOf([
      run('IN THE SUPERIOR COURT OF THE STATE OF CALIFORNIA', 80, 730),
      ...CAPTION_RUNS,
      run('TO ALL PARTIES AND THEIR ATTORNEYS OF RECORD:', 80, 540),
    ]);
    expect(tables).toHaveLength(1);
    expect(consumed.size).toBe(3);
    expect([...consumed].every((line) => line.baseline < 700 && line.baseline > 580)).toBe(true);
  });

  it('leaves a line beside the box in the flow and still builds the box', () => {
    const { tables, consumed } = tablesOf(
      [...CAPTION_RUNS.map((item) => ({ ...item, x: item.x + 72 })), run('Exhibit A', 76, 675)],
      INSET
    );
    expect(tables).toHaveLength(1);
    expect(consumed.size).toBe(3);
    expect(tables[0]?.cells[0]?.[0]?.lines.map(lineText)).toEqual(['JANE DOE, Plaintiff,']);
  });

  it('refuses the grid when a line crosses a vertical rule: the rules were not a table', () => {
    const { tables, consumed } = tablesOf([
      ...CAPTION_RUNS,
      run('IN THE SUPERIOR COURT OF THE STATE OF CALIFORNIA', 80, 645),
    ]);
    expect(tables).toEqual([]);
    expect(consumed.size).toBe(0);
  });

  it('refuses the grid when a line begins outside the box and ends inside it', () => {
    const { tables } = tablesOf(
      [
        ...CAPTION_RUNS.map((item) => ({ ...item, x: item.x + 72 })),
        run('Served by mail on counsel of record', 76, 645),
      ],
      INSET
    );
    expect(tables).toEqual([]);
  });

  it('is not a table when the grid caught no text at all', () => {
    expect(tablesOf([run('TO ALL PARTIES:', 80, 540)]).tables).toEqual([]);
  });

  it('leaves a California ")" caption alone: it is tab stops, not a ruled table', () => {
    const runs = [
      run('JANE DOE,', 80, 700),
      run(')', 290, 700),
      run('Case No. 24-CV-0001', 330, 700),
      run('Plaintiff,', 96, 686),
      run(')', 290, 686),
      run('PROOF OF SERVICE', 330, 686),
      run('v.', 80, 672),
      run(')', 290, 672),
      run('Dept. 21', 330, 672),
    ];
    // The filing rules a line above and below the caption; neither is a grid.
    const rules = [rule(72, 716, 468, 0), rule(72, 658, 468, 0)];
    const { tables, consumed, lines } = tablesOf(runs, rules);
    expect(tables).toEqual([]);
    expect(consumed.size).toBe(0);
    expect(tabStopsOf(lines, FRAME).map((stop) => stop.positionPt)).toEqual([218, 258]);
  });

  it('reads the caption box drawn as an L: one upright rule, one rule under the left cell', () => {
    const { tables, consumed } = tablesOf(L_RUNS, L_CAPTION);
    const table = tables[0];
    expect(tables).toHaveLength(1);
    expect(table?.columnEdges).toEqual([0, 234, 378]);
    expect(table?.rowEdges).toEqual([700, 580]);
    expect(table?.borders).toEqual({
      horizontal: [
        [false, false],
        [true, false],
      ],
      vertical: [[false, true, false]],
    });
    expect(table?.cells[0]?.[0]?.lines.map(lineText)).toEqual([
      'JANE DOE, an individual,',
      'Plaintiff,',
      'vs.',
      'ACME HOLDINGS, LLC, and',
      'DOES 1 through 20,',
      'inclusive,',
      'Defendants.',
    ]);
    expect(table?.cells[0]?.[1]?.lines.map(lineText)).toEqual([
      'Case No. 24-CV-0001',
      'NOTICE OF MOTION AND',
      'MOTION TO COMPEL',
      'Date: October 14, 2026',
      'Time: 9:00 a.m.',
      'Dept.: 21',
      'Judge: Hon. A. Reyes',
    ]);
    expect(consumed.size).toBe(7);
  });

  it('marks the foot drawn under the right cell too when the rule runs on', () => {
    const wide = L_CAPTION.map(({ rect }) =>
      rect.height === 0 ? rule(72, rect.y, 396, 0) : rule(rect.x, rect.y, rect.width, rect.height)
    );
    expect(tablesOf(L_RUNS, wide).tables[0]?.borders.horizontal[1]).toEqual([true, true]);
  });

  it('is not an L caption with only a few lines beside the rule', () => {
    const few = L_RUNS.filter((item) => item.y > 654);
    expect(tablesOf(few, L_CAPTION).tables).toEqual([]);
  });

  it('is not an L caption when nothing closes the foot of the rule', () => {
    const open = L_CAPTION.filter(({ rect }) => rect.height !== 0);
    expect(tablesOf(L_RUNS, open).tables).toEqual([]);
  });

  it('is not an L caption when the foot rule is nowhere near the rule it should meet', () => {
    const adrift = L_CAPTION.map(({ rect }) =>
      rect.height === 0 ? rule(72, 520, 234, 0) : rule(rect.x, rect.y, rect.width, rect.height)
    );
    expect(tablesOf(L_RUNS, adrift).tables).toEqual([]);
  });

  it('refuses the L caption when a line crosses the upright rule', () => {
    const crossing = [...L_RUNS, run('IN THE SUPERIOR COURT OF THE STATE OF CALIFORNIA', 80, 660)];
    expect(tablesOf(crossing, L_CAPTION).tables).toEqual([]);
  });

  it('leaves a full-width table to the page, not to one column of it', () => {
    const column: BodyFrame = { left: 72, right: 300, textRight: 300 };
    expect(tablesOf(CAPTION_RUNS, CAPTION, column).tables).toEqual([]);
  });
});

describe('tabStopsOf', () => {
  it('merges cell edges within a few points into one stop, measured from the frame', () => {
    const lines = linesOf([
      run('Fee', 72, 700),
      run('$100', 300, 700),
      run('Due', 450, 700),
      run('Costs', 72, 686),
      run('$250', 302, 686),
      run('Paid', 452, 686),
    ]);
    expect(
      tabStopsOf(lines, { left: 72, right: 540, textRight: 540 }).map((stop) => stop.positionPt)
    ).toEqual([228, 378]);
  });
});

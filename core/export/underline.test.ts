import { describe, expect, it } from 'vitest';
import type { LayoutRule } from '@shared/types';
import { run } from './layout-testkit';
import { lineText, linesOf } from './lines';
import { isUnderlined, underlineRules } from './underline';

function rule(x: number, y: number, width: number, height: number): LayoutRule {
  return { rect: { x, y, width, height } };
}

describe('underlineRules', () => {
  it('keeps a line drawn under a heading', () => {
    const under = rule(240, 598, 130, 0.5);
    expect(underlineRules([under])).toEqual([under]);
  });

  it('leaves out a caption box’s foot: a rule that meets an upright one is a border', () => {
    const foot = rule(131, 127, 202, 0.5);
    const upright = rule(332, 128, 0.5, 330);
    expect(underlineRules([foot, upright])).toEqual([]);
  });

  it('leaves out the upright rules themselves', () => {
    expect(underlineRules([rule(127, 94, 0.7, 660)])).toEqual([]);
  });
});

describe('a caption box’s foot under its last line', () => {
  const heading = run('GENERAL ALLEGATIONS', 240, 600);
  const last = run('COMPANY, a California corporation;', 135, 128.5, { width: 150 });
  const rules = [rule(240, 598.5, 115, 0.5), rule(131, 127.4, 202, 0.5), rule(332, 128, 0.5, 330)];

  it('underlines the heading and not the line that sits on the box’s foot', () => {
    const lines = linesOf([heading, last], rules);
    const underlined = lines.map((line) => line.cells[0]?.runs[0]?.underline);
    expect(lines.map(lineText)).toEqual([heading.text, last.text]);
    expect(underlined).toEqual([true, false]);
  });

  it('would have read the foot as an underline by its place alone', () => {
    expect(isUnderlined(last, rules)).toBe(true);
  });
});

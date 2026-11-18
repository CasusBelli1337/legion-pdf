import { describe, expect, it } from 'vitest';
import { fitToRow } from './cell-fit';
import type { TextParagraph } from './model';

/** A one-line paragraph with the leading and space-before that matter here. */
function paragraph(leadingPt: number, spaceBeforePt = 0): TextParagraph {
  return { kind: 'text', lines: [{}], leadingPt, spaceBeforePt } as unknown as TextParagraph;
}

const flowHeight = (paragraphs: TextParagraph[]): number =>
  paragraphs.reduce((sum, each) => sum + each.leadingPt + each.spaceBeforePt, 0);

describe('fitToRow', () => {
  it('tightens lines that overrun their row by a hair until they end at its edge', () => {
    // Eight lines set solid at 10.6 pt, carried at 11: 3.2 pt past a row 84.8 pt tall.
    const cell = Array.from({ length: 8 }, () => paragraph(11));
    fitToRow(cell, 300, 215.2);
    expect(flowHeight(cell)).toBeCloseTo(84.8, 5);
    expect(cell.every((each) => Math.abs(each.leadingPt - 10.6) < 1e-6)).toBe(true);
  });

  it('keeps the space between blocks and takes the overrun off the lines', () => {
    const cell = [paragraph(11), paragraph(11, 10), paragraph(11)];
    fitToRow(cell, 100, 58);
    expect(cell.map((each) => each.spaceBeforePt)).toEqual([0, 10, 0]);
    expect(flowHeight(cell)).toBeCloseTo(42, 5);
  });

  it('leaves a cell that fits exactly as it was', () => {
    const cell = [paragraph(12), paragraph(12, 6)];
    fitToRow(cell, 100, 60);
    expect(cell.map((each) => each.leadingPt)).toEqual([12, 12]);
  });

  it('does not crush a cell that overruns by more than rounding', () => {
    const cell = Array.from({ length: 4 }, () => paragraph(12));
    fitToRow(cell, 100, 70);
    expect(cell.map((each) => each.leadingPt)).toEqual([12, 12, 12, 12]);
  });
});

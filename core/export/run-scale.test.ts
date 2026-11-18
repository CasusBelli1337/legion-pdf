import { describe, expect, it } from 'vitest';
import type { LayoutFont } from '@shared/types';
import type { Cell, Line, StyledRun } from './model';
import { cellScale, withLineScales } from './run-scale';

const FONTS: Record<string, LayoutFont> = {
  times: { name: 'TimesNewRomanPSMT', family: 'serif', bold: false, italic: false },
  timesBold: { name: 'TimesNewRomanPS-BoldMT', family: 'serif', bold: true, italic: false },
  century: { name: 'CenturySchoolbook', family: 'serif', bold: false, italic: false },
};

/** Times-Roman sets this at 12 pt in 238.36 pt (AFM widths). */
const TEXT = 'The court now orders as follows, in Department 1';
const TIMES_WIDTH = 238.36;

function styledRun(text: string, extra: Partial<StyledRun> = {}): StyledRun {
  return {
    text,
    fontKey: 'times',
    sizePt: 12,
    colorHex: '000000',
    underline: false,
    hidden: false,
    ...extra,
  };
}

function cellOf(width: number, runs: StyledRun[]): Cell {
  return { x: 100, right: 100 + width, runs };
}

function lineOf(cells: Cell[]): Line {
  return {
    cells,
    baseline: 500,
    x: cells[0]?.x ?? 0,
    right: cells.at(-1)?.right ?? 0,
    sizePt: 12,
    blockId: null,
  };
}

describe('cellScale — a line set narrower than Word’s face is condensed to its own width', () => {
  it('leaves type alone that is as wide as Word would set it', () => {
    expect(cellScale(cellOf(TIMES_WIDTH, [styledRun(TEXT)]), FONTS)).toBeNull();
    expect(cellScale(cellOf(TIMES_WIDTH * 1.08, [styledRun(TEXT)]), FONTS)).toBeNull();
  });

  it('ignores a hair’s difference in visible type but not a plain condensing', () => {
    expect(cellScale(cellOf(TIMES_WIDTH * 0.985, [styledRun(TEXT)]), FONTS)).toBeNull();
    expect(cellScale(cellOf(TIMES_WIDTH * 0.905, [styledRun(TEXT)]), FONTS)).toBe(90);
  });

  it('holds recognised text to the width of the scan’s words, however little narrower', () => {
    const hidden = styledRun(TEXT, { hidden: true });
    expect(cellScale(cellOf(TIMES_WIDTH * 0.985, [hidden]), FONTS)).toBe(98);
    expect(cellScale(cellOf(TIMES_WIDTH * 0.955, [hidden]), FONTS)).toBe(95);
  });

  it('measures bold as bold — a bold heading is wider than the same words in roman', () => {
    const roman = cellScale(cellOf(TIMES_WIDTH, [styledRun(TEXT, { hidden: true })]), FONTS);
    const bold = cellScale(
      cellOf(TIMES_WIDTH, [styledRun(TEXT, { hidden: true, fontKey: 'timesBold' })]),
      FONTS
    );
    expect(roman).toBeNull();
    expect(bold).not.toBeNull();
    expect(bold).toBeLessThan(100);
  });

  it('never guesses at a face it has no widths for, a character it cannot encode, or a scrap', () => {
    const narrow = TIMES_WIDTH * 0.8;
    expect(cellScale(cellOf(narrow, [styledRun(TEXT, { fontKey: 'century' })]), FONTS)).toBeNull();
    expect(cellScale(cellOf(narrow, [styledRun(`${TEXT} →`)]), FONTS)).toBeNull();
    expect(cellScale(cellOf(10, [styledRun('abc def')]), FONTS)).toBeNull();
  });

  it('never squeezes below the floor', () => {
    expect(cellScale(cellOf(TIMES_WIDTH * 0.3, [styledRun(TEXT)]), FONTS)).toBe(60);
  });
});

describe('withLineScales', () => {
  it('scales each cell of a tabbed line by its own width and leaves the others as they were', () => {
    const condensed = cellOf(TIMES_WIDTH * 0.9, [styledRun(TEXT)]);
    const full = { ...cellOf(TIMES_WIDTH, [styledRun(TEXT)]), x: 400, right: 400 + TIMES_WIDTH };
    const [line] = withLineScales([lineOf([condensed, full])], FONTS);
    expect(line?.cells[0]?.runs[0]?.scalePct).toBe(90);
    expect(line?.cells[1]?.runs[0]?.scalePct).toBeUndefined();
  });
});

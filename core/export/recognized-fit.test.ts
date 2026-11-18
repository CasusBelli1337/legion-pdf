import { describe, expect, it } from 'vitest';
import type { Line, StyledRun } from './model';
import { fitRecognizedLines, timesWidth } from './recognized-fit';

const FRAME = { left: 110, right: 530, textRight: 530 };

function styledRun(text: string, sizePt: number, hidden: boolean): StyledRun {
  return { text, fontKey: 'times', sizePt, colorHex: '000000', underline: false, hidden };
}

interface TestCell {
  x: number;
  text: string;
  /** How wide the scan had the cell; a hundred points when not given. */
  width?: number;
}

function line(cells: TestCell[], sizePt = 11, hidden = true): Line {
  return {
    cells: cells.map((cell) => ({
      x: cell.x,
      right: cell.x + (cell.width ?? 100),
      runs: [styledRun(cell.text, sizePt, hidden)],
    })),
    baseline: 600,
    x: cells[0]?.x ?? 0,
    right: 540,
    sizePt,
    blockId: null,
  };
}

const LONG =
  'the Meridian Harbor Project at 1400 Wharf Boulevard in Port Calloway, California (collectively the';

describe('timesWidth', () => {
  it('measures text by the Times advance widths', () => {
    expect(timesWidth('Hello', 10)).toBeCloseTo(22.22, 2);
    expect(timesWidth('  ', 12)).toBeCloseTo(6, 5);
  });

  it('gives a character outside the table a middling width', () => {
    expect(timesWidth('—', 10)).toBeCloseTo(5.56, 2);
  });
});

describe('fitRecognizedLines', () => {
  it('sets a recognised line smaller, to the half point, until Word’s Times fits the room', () => {
    expect(timesWidth(LONG, 11)).toBeGreaterThan(FRAME.right - 110);
    const wide = { x: 110, text: LONG, width: timesWidth(LONG, 11) };
    const [fitted] = fitRecognizedLines([line([wide], 11)], FRAME);
    const sizePt = fitted?.sizePt ?? 0;
    expect(sizePt).toBeLessThan(11);
    expect(sizePt * 2).toBe(Math.round(sizePt * 2));
    expect(timesWidth(LONG, sizePt)).toBeLessThanOrEqual(FRAME.right - 110);
    expect(fitted?.cells[0]?.runs[0]?.sizePt).toBe(sizePt);
  });

  it('keeps the size of a line the scan set narrower than Times would: it is condensed, not shrunk', () => {
    // Word's character scaling brings the cell to the 400 pt the scan gave it.
    expect(timesWidth(LONG, 11)).toBeGreaterThan(420);
    const condensed = line([{ x: 110, text: LONG, width: 400 }], 11);
    expect(fitRecognizedLines([condensed], FRAME)[0]).toBe(condensed);
  });

  it('leaves a recognised line that fits exactly as it was', () => {
    const short = line([{ x: 110, text: 'Defendants named herein.' }]);
    expect(fitRecognizedLines([short], FRAME)[0]).toBe(short);
  });

  it('never touches real text, however wide', () => {
    const real = line([{ x: 110, text: LONG }], 11, false);
    expect(fitRecognizedLines([real], FRAME)[0]).toBe(real);
  });

  it('holds a cell to the room before the next tab stop', () => {
    const cells = [
      { x: 110, text: 'HARLAN FREIGHT COMPANY, a California corporation,', width: 230 },
      { x: 300, text: 'CASE NO. 22-0417' },
    ];
    const [fitted] = fitRecognizedLines([line(cells, 11)], FRAME);
    const sizePt = fitted?.sizePt ?? 0;
    expect(sizePt).toBeLessThan(11);
    expect(timesWidth(cells[0]?.text ?? '', sizePt)).toBeLessThanOrEqual(300 - 110);
  });

  it('stops at a readable size rather than vanish', () => {
    const [fitted] = fitRecognizedLines([line([{ x: 500, text: LONG }], 11)], FRAME);
    expect(fitted?.sizePt).toBe(6);
  });
});

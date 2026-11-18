import { describe, expect, it } from 'vitest';
import type { LayoutTextRun, PageLayout } from '@shared/types';
import type { Pleading } from './pleading';
import { timesWidth } from './recognized-fit';
import {
  hasInkBaselines,
  recognizedBodySize,
  recognizedPagesOf,
  withoutStrayNumbers,
  withoutStrays,
} from './recognized-pages';

/** A recognised word as wide as Times sets it at `typedPt`, carrying whatever size the OCR gave it. */
function word(text: string, sizePt: number, typedPt = 10.5, x = 140): LayoutTextRun {
  return {
    text,
    x,
    y: 500,
    width: timesWidth(text, typedPt),
    sizePt,
    fontKey: 'ocr',
    colorHex: '#000000',
    role: 'body',
    eol: false,
    hidden: true,
  };
}

function page(runs: LayoutTextRun[]): PageLayout {
  return {
    page: 1,
    size: { width: 612, height: 792 },
    rotation: 0,
    fonts: {},
    runs,
    images: [],
    rules: [],
    printedPageNumber: null,
  };
}

const WORDS = ['Defendant', 'Harlan', 'Freight', 'Company', 'alleges', 'follows'];
/** Box heights: every word a different size, as an ink-height OCR layer reports them. */
const boxHeights = (count: number): LayoutTextRun[] =>
  Array.from({ length: count }, (_unused, index) =>
    word(WORDS[index % WORDS.length] ?? 'Harlan', 8 + (index % 7) * 0.5)
  );

describe('recognizedBodySize', () => {
  it('reads the typed size off the words’ widths when their sizes are box heights', () => {
    expect(recognizedBodySize([page(boxHeights(40))])).toBe(10.5);
  });

  it('leaves a layer whose sizes agree, and agree with its widths, alone', () => {
    const steady = Array.from({ length: 40 }, () => word('Defendant', 12, 11.5));
    expect(recognizedBodySize([page(steady)])).toBeNull();
  });

  it('reads the typed size when steady sizes run a tenth under the words’ widths: ink again', () => {
    const lineHeights = Array.from({ length: 40 }, () => word('Defendant', 10.8, 12));
    expect(recognizedBodySize([page(lineHeights)])).toBe(12);
  });

  it('does not judge a document by a handful of words', () => {
    expect(recognizedBodySize([page(boxHeights(6))])).toBeNull();
  });

  it('ignores typed text', () => {
    const typed = boxHeights(40).map((run) => ({ ...run, hidden: false }));
    expect(recognizedBodySize([page(typed)])).toBeNull();
  });
});

describe('recognizedPagesOf', () => {
  it('sets every recognised word and line number in the one size', () => {
    const number: LayoutTextRun = { ...word('12', 7.5, 9, 110), role: 'line-number' };
    const [settled] = recognizedPagesOf([page([...boxHeights(40), word('of', 10.8), number])]);
    expect(new Set(settled?.runs.map((run) => run.sizePt))).toEqual(new Set([10.5]));
    // The rebuilt numbers are set in the body's Times, not the OCR layer's own face.
    const numberFont = settled?.fonts[settled.runs.at(-1)?.fontKey ?? ''];
    expect(numberFont).toMatchObject({ name: 'TimesNewRomanPSMT', bold: false });
  });

  it('keeps a title typed plainly larger at its own size', () => {
    const title = word('COMPLAINT', 11, 14);
    const [settled] = recognizedPagesOf([page([...boxHeights(40), title])]);
    expect(settled?.runs.at(-1)?.sizePt).toBe(14);
  });

  /** A line of words on one baseline, as a layer with ink-bottom baselines reports them. */
  const inkLine = (y: number): LayoutTextRun[] =>
    ['principal', 'business', 'agent', 'located', 'Court,', '(herein)'].map((text, index) => ({
      ...word(text, 9, 10.5, 140 + index * 60),
      y:
        y -
        (/[gjpqy]/.test(text) ? 0.22 : /[()]/.test(text) ? 0.18 : /,/.test(text) ? 0.13 : 0) * 10.5,
    }));
  const inkPage = (): LayoutTextRun[] => [
    ...boxHeights(40),
    ...Array.from({ length: 8 }, (_unused, index) => inkLine(700 - index * 21)).flat(),
  ];
  /** The same page as a layer that hands every space over as a run of its own. */
  const spaced = (runs: LayoutTextRun[]): LayoutTextRun[] =>
    runs.flatMap((run) => [run, { ...run, text: ' ', x: run.x + run.width, width: 3 }]);

  it('tells ink-bottom baselines from true ones, spaces between the words or not', () => {
    expect(hasInkBaselines([page(inkPage())], 10.5)).toBe(true);
    expect(hasInkBaselines([page(spaced(inkPage()))], 10.5)).toBe(true);
    const level = inkPage().map((run) => ({ ...run, y: 700 }));
    expect(hasInkBaselines([page(level)], 10.5)).toBe(false);
    expect(hasInkBaselines([page(inkLine(700))], 10.5)).toBe(false);
  });

  it('lifts a word off the bottom of its descender, comma or bracket, back onto its baseline', () => {
    const [settled] = recognizedPagesOf([page(inkPage())]);
    const line = settled?.runs.slice(40, 46) ?? [];
    expect(line.map((run) => run.text)).toEqual(inkLine(0).map((run) => run.text));
    for (const run of line) expect(run.y).toBeCloseTo(700, 5);
  });

  it('lifts ink-bottom baselines even where the layer’s sizes are sound', () => {
    const steady = Array.from({ length: 40 }, () => word('Harlan', 10.5, 10.5));
    const lines = Array.from({ length: 8 }, (_unused, index) => inkLine(700 - index * 21)).flat();
    const sound = lines.map((run) => ({ ...run, sizePt: 10.5 }));
    const [settled] = recognizedPagesOf([page([...steady, ...sound])]);
    expect(recognizedBodySize([page([...steady, ...sound])])).toBeNull();
    for (const run of settled?.runs.slice(40, 46) ?? []) expect(run.y).toBeCloseTo(700, 5);
    expect(settled?.runs[0]?.sizePt).toBe(10.5);
  });

  it('leaves the baselines of a layer that already has true ones', () => {
    const level = inkPage().map((run, index) => (index < 40 ? run : { ...run, y: 700 }));
    const [settled] = recognizedPagesOf([page(level)]);
    expect(new Set(settled?.runs.slice(40).map((run) => run.y))).toEqual(new Set([700]));
  });

  it('sizes a foot by its own words: a document number by its width, the page number no larger than the body', () => {
    const documentId: LayoutTextRun = { ...word('4417-0093-2', 3.5, 6), role: 'footer' };
    const number: LayoutTextRun = { ...word('- 2 -', 12, 4), role: 'page-number' };
    const [settled] = recognizedPagesOf([page([...boxHeights(40), documentId, number])]);
    expect(settled?.runs.slice(-2).map((run) => run.sizePt)).toEqual([6, 10.5]);
  });

  it('raises a small page number and its dashes by as much as the layer under-reports the body', () => {
    // A layer that reads 12 pt type as 11: a 9 pt number was typed at about 10.
    const body = Array.from({ length: 40 }, () => word('Defendant', 10.8, 12));
    const foot = ['-', '1', '-'].map((text): LayoutTextRun => ({
      ...word(text, 9, 10),
      role: text === '1' ? 'page-number' : 'footer',
    }));
    const [settled] = recognizedPagesOf([page([...body, ...foot])]);
    expect(settled?.runs.slice(-3).map((run) => run.sizePt)).toEqual([10, 10, 10]);
  });

  it('leaves typed text as it was', () => {
    const typed: LayoutTextRun = { ...word('Exhibit', 9), hidden: false };
    const [settled] = recognizedPagesOf([page([...boxHeights(40), typed])]);
    expect(settled?.runs.at(-1)?.sizePt).toBe(9);
  });

  it('marks a caption’s column of parentheses, each a cell of its own', () => {
    const parens = Array.from({ length: 8 }, (_unused, index) => ({
      ...word(')', 11, 11, 327 + (index % 2) * 0.4),
      y: 400 - index * 12,
    }));
    const loose = { ...word(')', 11, 11, 210), y: 500 };
    const [settled] = recognizedPagesOf([page([word('Plaintiff,', 11, 11), ...parens, loose])]);
    expect(settled?.runs.filter((run) => run.ownCell === true)).toHaveLength(8);
    expect(settled?.runs.at(-1)?.ownCell).toBeUndefined();
  });

  it('does not take a few parentheses for a column', () => {
    const few = Array.from({ length: 3 }, () => word(')', 11, 11, 327));
    const [settled] = recognizedPagesOf([page(few)]);
    expect(settled?.runs.some((run) => run.ownCell === true)).toBe(false);
  });
});

describe('withoutStrays', () => {
  it('takes the leftovers out of the body only, and hands an untouched page back as it was', () => {
    const pleading = { numberRight: 120 } as Pleading;
    const number: LayoutTextRun = { ...word('12', 8, 9, 110), role: 'line-number' };
    const stray = word('l2', 8, 9, 110);
    const body = word('standing', 9);
    expect(withoutStrays(page([number, stray, body]), pleading).runs).toEqual([number, body]);
    const clean = page([number, body]);
    expect(withoutStrays(clean, pleading)).toBe(clean);
  });
});

describe('withoutStrayNumbers', () => {
  const pleading = { numberRight: 120 } as Pleading;
  const inColumn = (text: string, hidden = true): LayoutTextRun => ({
    ...word(text, 8, 9, 110),
    hidden,
  });

  it('drops a scan’s misread line numbers from the numbered column', () => {
    const body = word('standing', 9);
    const runs = [inColumn('ll'), inColumn('l6'), inColumn('l'), inColumn('.12'), body];
    expect(withoutStrayNumbers(runs, pleading)).toEqual([body]);
  });

  it('drops recognised junk that begins in the column and runs into the body', () => {
    const junk = inColumn('567009');
    junk.width = 35;
    const space = inColumn(' ');
    space.x = 119;
    expect(withoutStrayNumbers([junk, space], pleading)).toEqual([]);
  });

  it('keeps a typed word that only begins in the column', () => {
    const reaching = inColumn('14', false);
    reaching.width = 30;
    expect(withoutStrayNumbers([reaching], pleading)).toEqual([reaching]);
  });

  it('drops only bare numbers from typed text', () => {
    const letters = inColumn('ll', false);
    expect(withoutStrayNumbers([letters, inColumn('14', false)], pleading)).toEqual([letters]);
  });

  it('leaves a page without numbered lines alone', () => {
    const runs = [inColumn('ll')];
    expect(withoutStrayNumbers(runs, null)).toBe(runs);
  });
});

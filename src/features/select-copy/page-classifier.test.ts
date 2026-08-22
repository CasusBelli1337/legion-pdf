import { describe, expect, it } from 'vitest';
import { classifyPage, looksLikeBates } from './page-classifier';
import { planRegions } from './region-plan';
import { findLineNumberColumns } from './line-columns';
import { positionItems } from './item-geometry';
import { parsePrintedNumber, reconcilePrintedNumbers } from './printed-page';
import { repeatedBandText } from './repeated-bands';
import { LETTER, condensedSheet, pageOf, plainPage, pleadingPage, itemOf } from './synthetic-pages';
import type { TextRole } from './contract';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday'];

const BODY = [
  'The witness testified that he had never seen the document before',
  'the deposition, and that no one at the company had shown it to him',
  'at any time during his employment there.',
];

/**
 * The role of the FIRST item carrying `text`. Reading order puts line 1 before
 * the "1" printed in the footer, so the margin number is what this returns —
 * which is the point: the two are the same string and must not be the same role.
 */
function roleOfText(page: ReturnType<typeof classifyPage>, text: string): TextRole | undefined {
  const item = page.positioned.find((candidate) => candidate.item.str === text);
  return item === undefined ? undefined : page.roles.get(item.itemIndex);
}

describe('line-number columns', () => {
  it('finds the single column down the margin of pleading paper', () => {
    const input = pleadingPage({ page: 3, printed: 1, lines: BODY });
    const columns = findLineNumberColumns(positionItems(input.items), LETTER);

    expect(columns).toHaveLength(1);
    expect(columns[0]?.quadrant).toBeNull();
    expect(columns[0]?.entries).toHaveLength(28);
    expect(columns[0]?.xMax).toBeLessThan(90);
  });

  it('finds four independent columns on a condensed sheet', () => {
    const sheet = condensedSheet(1, [
      { number: 1, lines: ['Q. State your name for the record.'] },
      { number: 2, lines: ['A. James Ashford.'] },
      { number: 3, lines: ['Q. And your address?'] },
      { number: 4, lines: ['A. I decline to answer.'] },
    ]);
    const columns = findLineNumberColumns(positionItems(sheet.items), sheet.size);

    expect(columns).toHaveLength(4);
    expect(columns.map((column) => column.quadrant)).toEqual([0, 1, 2, 3]);
    for (const column of columns) expect(column.entries).toHaveLength(25);
  });

  it('finds nothing on a page with no margin numbers', () => {
    const input = plainPage(4, BODY, 4);
    expect(findLineNumberColumns(positionItems(input.items), LETTER)).toHaveLength(0);
  });

  it('does not mistake a short run of stray integers for a column', () => {
    const input = pageOf(1, [
      { text: '1', x: 54, y: 700 },
      { text: '2', x: 54, y: 676 },
      { text: '3', x: 54, y: 652 },
      { text: 'Exhibit list follows.', x: 90, y: 700 },
    ]);
    expect(findLineNumberColumns(positionItems(input.items), LETTER)).toHaveLength(0);
  });
});

describe('roles', () => {
  it('marks margin numbers, the header, the Bates stamp and the page number off', () => {
    const input = pleadingPage({
      page: 3,
      printed: 1,
      lines: BODY,
      header: 'ASHFORD v. ASHFORD — DEPOSITION OF JAMES ASHFORD',
      bates: 'ASHFORD000123',
    });
    const page = classifyPage(input);

    expect(roleOfText(page, '1')).toBe('line-number');
    expect(roleOfText(page, '28')).toBe('line-number');
    expect(roleOfText(page, 'ASHFORD v. ASHFORD — DEPOSITION OF JAMES ASHFORD')).toBe('header');
    expect(roleOfText(page, 'ASHFORD000123')).toBe('stamp');
    expect(roleOfText(page, BODY[0] ?? '')).toBe('body');
    expect(page.classification.printedPageNumber).toBe(1);
  });

  it('keeps the last line of a condensed sheet as body, not a footer', () => {
    const filler = Array.from({ length: 25 }, (_, line) => `line ${line + 1} of testimony`);
    const sheet = condensedSheet(1, [
      { number: 1, lines: filler },
      { number: 2, lines: filler },
      { number: 3, lines: filler },
      { number: 4, lines: filler },
    ]);
    const page = classifyPage(sheet);
    const last = page.positioned.filter((item) => item.item.str === 'line 25 of testimony');

    expect(last).toHaveLength(4);
    for (const item of last) expect(page.roles.get(item.itemIndex)).toBe('body');
  });

  it('recognises a Bates string but not a caption case number', () => {
    expect(looksLikeBates('ASHFORD000123')).toBe(true);
    expect(looksLikeBates('ABC-000123')).toBe(true);
    expect(looksLikeBates('The witness testified.')).toBe(false);
    expect(looksLikeBates('28')).toBe(false);
  });

  // The 2026-08-20 Ashford copy bug: the footer title's FIRST line sits just
  // above the strict band, was classified body, and rode into the clipboard.
  it('keeps a pleading footer title out of body even above the strict band', () => {
    const lines = Array.from({ length: 28 }, (_, index) =>
      index === 27 ? 'reviewed the contents of the imaged drives at any time' : ''
    );
    const page = classifyPage(
      pleadingPage({
        page: 2,
        printed: 2,
        lines,
        footer: [
          'DECLARATION OF MARGARET C. VANCE IN SUPPORT OF',
          'MOTION FOR DETERMINATION OF CLAIM OF PRIVILEGE',
        ],
      })
    );

    expect(roleOfText(page, 'DECLARATION OF MARGARET C. VANCE IN SUPPORT OF')).toBe('footer');
    expect(roleOfText(page, 'MOTION FOR DETERMINATION OF CLAIM OF PRIVILEGE')).toBe('footer');
    expect(roleOfText(page, 'reviewed the contents of the imaged drives at any time')).toBe('body');
    expect(roleOfText(page, '28')).toBe('line-number');
    expect(page.classification.printedPageNumber).toBe(2);
  });

  it('rescues a repeating footer notice that sits above the strict band', () => {
    const inputs = [1, 2, 3, 4].map((page) =>
      pageOf(page, [
        { text: `The ${DAYS[page - 1] ?? 'first'} hearing began at nine.`, x: 90, y: 400 },
        { text: 'CONFIDENTIAL — SUBJECT TO PROTECTIVE ORDER', x: 90, y: 80, size: 9 },
      ])
    );
    const repeated = repeatedBandText(
      inputs.map((input) => ({ items: positionItems(input.items), size: input.size }))
    );
    const first = inputs[0];
    if (first === undefined) throw new Error('fixture');
    const page = classifyPage(first, { repeatedBandText: repeated });

    expect(roleOfText(page, 'CONFIDENTIAL — SUBJECT TO PROTECTIVE ORDER')).toBe('footer');
    expect(roleOfText(page, 'The monday hearing began at nine.')).toBe('body');
  });
});

describe('printed page numbers', () => {
  it('reads the number printed on the page, not the PDF index', () => {
    const page = classifyPage(pleadingPage({ page: 3, printed: 1, lines: BODY }));
    expect(page.classification.printedPageNumber).toBe(1);
    expect(page.classification.printedNumberConfidence).toBe('high');
  });

  it('never mistakes line 28 for the page number', () => {
    const page = classifyPage(pleadingPage({ page: 3, lines: BODY }));
    expect(page.classification.printedPageNumber).toBeNull();
  });

  it('prefers the footer number closest to the PDF index', () => {
    const input = pageOf(9, [
      ...pleadingPage({ page: 9, lines: BODY }).items.map((item, index) => ({
        text: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        size: index === 0 ? 10 : 11,
      })),
      { text: '7', x: 300, y: 44, size: 10 },
      { text: '412', x: 500, y: 44, size: 10 },
    ]);
    const page = classifyPage(input);
    expect(page.classification.printedPageNumber).toBe(7);
  });

  it('still cites a multi-volume transcript, but says the guess is soft', () => {
    const page = classifyPage(plainPage(7, BODY, 412));
    expect(page.classification.printedPageNumber).toBe(412);
    expect(page.classification.printedNumberConfidence).toBe('low');
  });

  it('believes a far-from-index number once its neighbours agree', () => {
    const observed = new Map([
      [6, { value: 411, confidence: 'low' as const, itemIndex: null }],
      [7, { value: 412, confidence: 'low' as const, itemIndex: null }],
      [8, { value: 413, confidence: 'low' as const, itemIndex: null }],
    ]);
    expect(reconcilePrintedNumbers(observed).get(7)?.confidence).toBe('high');
  });

  it('demotes a number that fits neither neighbour', () => {
    const observed = new Map([
      [6, { value: 4, confidence: 'high' as const, itemIndex: null }],
      [7, { value: 91, confidence: 'high' as const, itemIndex: null }],
      [8, { value: 6, confidence: 'high' as const, itemIndex: null }],
    ]);
    expect(reconcilePrintedNumbers(observed).get(7)?.confidence).toBe('low');
  });

  it('parses the footer forms a printed page number actually takes', () => {
    expect(parsePrintedNumber('5')).toBe(5);
    expect(parsePrintedNumber('Page 5')).toBe(5);
    expect(parsePrintedNumber('- 5 -')).toBe(5);
    expect(parsePrintedNumber('[5]')).toBe(5);
    expect(parsePrintedNumber('5 of 37')).toBe(5);
    expect(parsePrintedNumber('ASHFORD000005')).toBeNull();
    expect(parsePrintedNumber('March 5, 2026')).toBeNull();
  });
});

describe('repeating bands', () => {
  it('finds the running head across pages and ignores one-off band text', () => {
    const pages = [3, 4, 5, 6].map((page) =>
      pleadingPage({
        page,
        printed: page - 2,
        lines: [`Testimony given on the ${DAYS[page - 3] ?? 'first'} day of trial.`, ...BODY],
        header: 'ASHFORD v. ASHFORD — DEPOSITION OF JAMES ASHFORD',
        bates: `ASHFORD00012${page}`,
      })
    );
    const bands = repeatedBandText(
      pages.map((input) => ({ items: positionItems(input.items), size: input.size }))
    );

    expect(bands.has('ashford v. ashford — deposition of james ashford')).toBe(true);
    expect(bands.has('ashford######')).toBe(true);
    expect(bands.has('testimony given on the monday day of trial.')).toBe(false);
  });

  it('needs more than two pages before calling anything a band', () => {
    expect(repeatedBandText([]).size).toBe(0);
  });
});

describe('mini-page reading order', () => {
  it('orders the quadrants by the numbers printed on them', () => {
    const sheet = condensedSheet(1, [
      { number: 11, lines: ['first'] },
      { number: 12, lines: ['second'] },
      { number: 13, lines: ['third'] },
      { number: 14, lines: ['fourth'] },
    ]);
    const positioned = positionItems(sheet.items);
    const columns = findLineNumberColumns(positioned, sheet.size);
    expect(planRegions(columns, positioned, sheet.size).regions).toEqual([0, 1, 2, 3]);
  });

  it('falls back to left column then right when the minis are unnumbered', () => {
    const positioned = positionItems([
      ...Array.from({ length: 8 }, (_, line) =>
        itemOf({ text: String(line + 1), x: 20, y: 570 - line * 10, size: 7 })
      ),
      ...Array.from({ length: 8 }, (_, line) =>
        itemOf({ text: String(line + 1), x: 20, y: 264 - line * 10, size: 7 })
      ),
      ...Array.from({ length: 8 }, (_, line) =>
        itemOf({ text: String(line + 1), x: 416, y: 570 - line * 10, size: 7 })
      ),
      ...Array.from({ length: 8 }, (_, line) =>
        itemOf({ text: String(line + 1), x: 416, y: 264 - line * 10, size: 7 })
      ),
    ]);
    const size = { width: 792, height: 612 };
    const columns = findLineNumberColumns(positioned, size);
    expect(planRegions(columns, positioned, size).regions).toEqual([0, 1, 2, 3]);
  });
});

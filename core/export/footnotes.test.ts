import { describe, expect, it } from 'vitest';
import type { LayoutTextRun, PageLayout } from '@shared/types';
import { hasFootnotes, liftFootnotes } from './footnotes';
import { page, paragraphLines, run } from './layout-testkit';
import { pageParagraphs } from './page-paragraphs';
import { sectionGeometry } from './page-setup';

const RULE = { rect: { x: 72, y: 150, width: 144, height: 0.6 } };

/** A raised 8 pt number, the way Word sets a footnote's mark over 12 pt text. */
function mark(text: string, x: number, baseline: number): LayoutTextRun {
  return run(text, x, baseline + 4.5, { sizePt: 8, width: 4 });
}

/** One footnote's lines under the rule: a mark, then text on a 13.8 pt pitch. */
function note(number: number, top: number, lines = 2): LayoutTextRun[] {
  return [
    mark(String(number), 72, top),
    ...paragraphLines(lines, top, {
      x: 79,
      pitch: 13.8,
      text: `Note ${number} cites the record at length here`,
    }),
  ];
}

/** A body paragraph whose first line carries the given reference marks at its end. */
function body(marks: string[]): LayoutTextRun[] {
  return [
    ...paragraphLines(3, 700, { pitch: 24 }),
    ...marks.map((text, index) => mark(text, 482 + index * 30, 700)),
  ];
}

function build(layout: PageLayout) {
  return pageParagraphs(layout, sectionGeometry([layout]));
}

function textOf(paragraph: { lines: { cells: { runs: { text: string }[] }[] }[] }): string {
  return paragraph.lines
    .flatMap((line) => line.cells.flatMap((cell) => cell.runs.map((entry) => entry.text)))
    .join('');
}

describe('liftFootnotes', () => {
  it('takes the notes out of the flow and marks each one’s reference', () => {
    const layout = page([...body(['1', '2']), ...note(1, 134), ...note(2, 100, 1)], {
      rules: [RULE],
    });
    const built = build(layout);
    const lift = liftFootnotes(built, layout, 1);

    expect(lift.kind).toBe('lifted');
    if (lift.kind !== 'lifted') return;
    expect(lift.notes.map((entry) => entry.id)).toEqual([1, 2]);
    expect(textOf(lift.notes[0]!.paragraphs[0]!)).toMatch(/^\s?Note 1 cites/);
    expect(lift.notes[0]!.mark.text.trim()).toBe('1');
    const left = built.columns.flat();
    const flowing = left.map((paragraph) => (paragraph.kind === 'text' ? textOf(paragraph) : ''));
    expect(flowing.join(' ')).not.toContain('Note');
    const references = left
      .flatMap((paragraph) => (paragraph.kind === 'text' ? paragraph.lines : []))
      .flatMap((line) => line.cells.flatMap((cell) => cell.runs))
      .filter((entry) => entry.footnote !== undefined);
    expect(references.map((entry) => entry.footnote)).toEqual([1, 2]);
  });

  it('measures the room above the notes and where their rule sat', () => {
    const layout = page([...body(['1']), ...note(1, 134)], { rules: [RULE] });
    const lift = liftFootnotes(build(layout), layout, 1);
    if (lift.kind !== 'lifted') throw new Error('expected a lifted footnote');
    // Line boxes are 13.8 pt with the baseline 80% down: the first tops out 11.04 pt over 134.
    expect(lift.top).toBeCloseTo(145.04, 1);
    expect(lift.bottom).toBeCloseTo(134 - 13.8 - 0.2 * 13.8, 1);
    expect(lift.risePt).toBeCloseTo(150.3 - 145.04, 1);
    expect(lift.gapPt).toBeGreaterThan(400);
  });

  it('keeps a second paragraph with the note it belongs to', () => {
    const second = paragraphLines(1, 96, {
      x: 100,
      pitch: 13.8,
      text: 'A second paragraph of it.',
    });
    const layout = page([...body(['1']), ...note(1, 134), ...second], { rules: [RULE] });
    const lift = liftFootnotes(build(layout), layout, 1);
    if (lift.kind !== 'lifted') throw new Error('expected a lifted footnote');
    expect(lift.notes).toHaveLength(1);
    expect(lift.notes[0]!.paragraphs.length).toBeGreaterThan(1);
  });

  it.each([
    ['a note with no reference above the rule', body([]), 1],
    ['a note referenced twice', body(['1', '1']), 1],
    ['a note whose number does not follow the last page’s', body(['1']), 3],
  ])('leaves the notes as paragraphs for %s', (_name, runs, next) => {
    const layout = page([...runs, ...note(1, 134)], { rules: [RULE] });
    const built = build(layout);
    const before = built.columns.flat().length;
    expect(liftFootnotes(built, layout, next).kind).toBe('kept');
    expect(built.columns.flat()).toHaveLength(before);
    expect(hasFootnotes(built, layout)).toBe(true);
  });

  it('leaves the notes as paragraphs when the body runs down to them, with no room for a separator', () => {
    const tight = [
      ...paragraphLines(1, 151, { text: 'The body’s last line' }),
      mark('1', 320, 151),
    ];
    const layout = page([...body([]), ...tight, ...note(1, 134)], {
      rules: [{ rect: { ...RULE.rect, y: 146 } }],
    });
    const built = build(layout);
    expect(hasFootnotes(built, layout)).toBe(true);
    expect(liftFootnotes(built, layout, 1).kind).toBe('kept');
  });

  it('leaves text carried over from the last page’s note where it is', () => {
    const carried = paragraphLines(2, 134, {
      x: 72,
      pitch: 13.8,
      text: 'carried over from before',
    });
    const layout = page([...body(['1']), ...carried, ...note(1, 100, 1)], { rules: [RULE] });
    // The paragraph under the rule opens with no mark: nothing here reads as this page's notes.
    expect(liftFootnotes(build(layout), layout, 1).kind).toBe('none');
  });

  it('sees no footnotes without the rule, or under a rule that underlines text', () => {
    const plain = page([...body(['1']), ...note(1, 134)]);
    expect(liftFootnotes(build(plain), plain, 1).kind).toBe('none');
    const underlined = page([...body([]), ...paragraphLines(1, 152, { text: 'A heading' })], {
      rules: [RULE],
    });
    expect(hasFootnotes(build(underlined), underlined)).toBe(false);
  });
});

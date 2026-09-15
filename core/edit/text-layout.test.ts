import { describe, expect, it } from 'vitest';
import { layoutParagraph, type LayoutSpec } from './text-layout';

/** A monospace ruler: six points per character, so widths are easy to reason about. */
const measure = (text: string): number => text.length * 6;

const SPEC: LayoutSpec = { left: 100, right: 220, firstIndent: 0, alignment: 'left', leading: 14 };

function texts(lines: ReturnType<typeof layoutParagraph>): string[] {
  return lines.map((line) => line.words.map((word) => word.text).join(' '));
}

describe('layoutParagraph', () => {
  it('wraps greedily at the measure, twenty characters here', () => {
    const lines = layoutParagraph('the quick brown fox jumps over the lazy dog', SPEC, measure);
    expect(texts(lines)).toEqual(['the quick brown fox', 'jumps over the lazy', 'dog']);
    expect(lines.map((line) => line.row)).toEqual([0, 1, 2]);
    expect(lines.every((line) => line.start === 100)).toBe(true);
  });

  it('honours hard line breaks and never justifies the line before one', () => {
    const lines = layoutParagraph(
      'one two\nthree four five six seven',
      { ...SPEC, alignment: 'justify' },
      measure
    );
    expect(texts(lines)).toEqual(['one two', 'three four five six', 'seven']);
    expect(lines[0]?.extraPerGap).toBe(0);
    expect(lines[1]?.extraPerGap).toBeGreaterThan(0);
    expect(lines[2]?.extraPerGap).toBe(0);
  });

  it('spreads a justified line so its words reach the right edge exactly', () => {
    const [line] = layoutParagraph(
      'aaa bbb ccc ddd eee fff ggg',
      { ...SPEC, alignment: 'justify' },
      measure
    );
    // Five words fit (19 chars = 114pt of 120); the 6pt of slack spreads over four gaps.
    expect(line?.words.map((word) => word.text)).toEqual(['aaa', 'bbb', 'ccc', 'ddd', 'eee']);
    expect(line?.extraPerGap).toBeCloseTo(6 / 4, 6);
  });

  it('starts a centred line at the middle of its slack and a right-aligned one at the edge', () => {
    const [centred] = layoutParagraph('ten chars!', { ...SPEC, alignment: 'center' }, measure);
    expect(centred?.start).toBe(100 + (120 - 60) / 2);
    const [right] = layoutParagraph('ten chars!', { ...SPEC, alignment: 'right' }, measure);
    expect(right?.start).toBe(220 - 60);
  });

  it('indents the first line only', () => {
    const lines = layoutParagraph(
      'aaaa bbbb cccc dddd eeee',
      { ...SPEC, firstIndent: 30 },
      measure
    );
    expect(lines[0]?.start).toBe(130);
    expect(lines[1]?.start).toBe(100);
    // The indented first line has less room: 90pt holds three words (18 chars = 108pt? no — two).
    expect(texts(lines)[0]).toBe('aaaa bbbb cccc');
  });

  it('lets a word wider than the measure overhang rather than cutting it', () => {
    const lines = layoutParagraph('short antidisestablishmentarianism end', SPEC, measure);
    expect(texts(lines)).toEqual(['short', 'antidisestablishmentarianism', 'end']);
  });

  it('gives an empty paragraph one empty line', () => {
    const lines = layoutParagraph('', SPEC, measure);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.words).toEqual([]);
  });
});

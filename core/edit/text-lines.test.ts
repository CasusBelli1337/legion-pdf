import { describe, expect, it } from 'vitest';
import {
  alignmentOf,
  fromFrame,
  groupLines,
  leadingOf,
  lineAt,
  paragraphAround,
  toFrame,
  type PlacedGlyph,
  type TextLine,
} from './text-lines';

/** A glyph half an em wide, drawn at (x, y) — the shape every test here builds from. */
function glyph(character: string, x: number, y: number, size = 12, angle = 0): PlacedGlyph {
  const advance = size * 0.5;
  return {
    code: character.charCodeAt(0),
    origin: { x, y },
    box: { x, y: y - size * 0.2, width: advance, height: size },
    advance,
    show: 0,
    item: 0,
    index: 0,
    fontName: 'F1',
    size,
    fillColor: '#000000',
    renderMode: 0,
    angle,
  };
}

/** Lays a string out as glyphs from (x, y), a space being a gap not a glyph. */
function typed(text: string, x: number, y: number, size = 12): PlacedGlyph[] {
  const glyphs: PlacedGlyph[] = [];
  let pen = x;
  for (const character of text) {
    if (character !== ' ') glyphs.push(glyph(character, pen, y, size));
    pen += size * 0.5;
  }
  return glyphs;
}

const decode = (item: PlacedGlyph): string => String.fromCharCode(item.code);

describe('groupLines', () => {
  it('puts glyphs on the same baseline together, in reading order, with word gaps as spaces', () => {
    const glyphs = [
      ...typed('WORLD', 136, 100),
      ...typed('HELLO', 100, 100),
      ...typed('BELOW', 100, 80),
    ];
    const lines = groupLines(glyphs, 0, decode);
    expect(lines.map((line) => line.text)).toEqual(['HELLO WORLD', 'BELOW']);
    expect(lines[0]?.start).toBe(100);
    expect(lines[0]?.end).toBe(136 + 5 * 6);
  });

  it('leaves invisible (mode 3) text out — nobody can see it to edit it', () => {
    const hidden = typed('OCR', 100, 100).map((item) => ({ ...item, renderMode: 3 }));
    expect(
      groupLines([...hidden, ...typed('SEEN', 100, 80)], 0, decode).map((l) => l.text)
    ).toEqual(['SEEN']);
  });

  it('reads text running up the page when asked for that angle', () => {
    const angle = Math.PI / 2;
    const glyphs = 'UP'
      .split('')
      .map((character, index) => glyph(character, 300, 100 + index * 6, 12, angle));
    const lines = groupLines(glyphs, angle, decode);
    expect(lines.map((line) => line.text)).toEqual(['UP']);
    expect(groupLines(glyphs, 0, decode)).toEqual([]);
  });
});

describe('lineAt', () => {
  const lines = groupLines([...typed('TOP LINE', 100, 200), ...typed('NEXT', 100, 186)], 0, decode);

  it('finds the line under the click, and the nearest one just off it', () => {
    expect(lineAt(lines, { along: 110, across: 203 })).toBe(0);
    expect(lineAt(lines, { along: 110, across: 184 })).toBe(1);
  });

  it('answers -1 well away from any text', () => {
    expect(lineAt(lines, { along: 110, across: 300 })).toBe(-1);
    expect(lineAt(lines, { along: 400, across: 200 })).toBe(-1);
  });
});

/** A justified block of prose: every line but the last fills the measure. */
function prose(): TextLine[] {
  const glyphs = [
    ...typed('AAAA AAAA AAAA', 100, 300),
    ...typed('BBBB BBBB BBBB', 100, 286),
    ...typed('CCCC CCCC CCCC', 100, 272),
    ...typed('DD', 100, 258),
    // A separate paragraph after a blank line.
    ...typed('EEEE EEEE EEEE', 100, 230),
    ...typed('FFFF FFFF FFFF', 100, 216),
    // Pleading-style line numbers in their own column, never part of prose.
    ...typed('1', 40, 300),
    ...typed('2', 40, 286),
  ];
  return groupLines(glyphs, 0, decode);
}

describe('paragraphAround', () => {
  it('gathers the lines above and below up to the paragraph break', () => {
    const lines = prose();
    const hit = lines.findIndex((line) => line.text.startsWith('CCCC'));
    const block = paragraphAround(lines, hit).map((index) => lines[index]?.text);
    expect(block).toEqual(['AAAA AAAA AAAA', 'BBBB BBBB BBBB', 'CCCC CCCC CCCC', 'DD']);
  });

  it('does not run on from a short last line into the next paragraph', () => {
    const lines = prose();
    const hit = lines.findIndex((line) => line.text.startsWith('EEEE'));
    const block = paragraphAround(lines, hit).map((index) => lines[index]?.text);
    expect(block).toEqual(['EEEE EEEE EEEE', 'FFFF FFFF FFFF']);
  });

  it('keeps a line-number column apart from the prose beside it', () => {
    const lines = prose();
    const hit = lines.findIndex((line) => line.text === '1');
    expect(paragraphAround(lines, hit).map((index) => lines[index]?.text)).toEqual(['1', '2']);
  });
});

describe('alignment and leading', () => {
  it('reads a filled block as justified and measures its leading', () => {
    const lines = prose().filter((line) => /^[ABCD]/.test(line.text));
    expect(alignmentOf(lines)).toBe('justify');
    expect(leadingOf(lines)).toBe(14);
  });

  it('reads ragged-right prose as left-aligned', () => {
    const lines = groupLines(
      [...typed('AAAA AAAA', 100, 300), ...typed('BBBBB BB', 100, 286), ...typed('C', 100, 272)],
      0,
      decode
    );
    expect(alignmentOf(lines)).toBe('left');
  });

  it('reads lines sharing a right edge as right-aligned and a middle as centred', () => {
    const right = groupLines([...typed('AAAAAA', 100, 300), ...typed('BB', 124, 286)], 0, decode);
    expect(alignmentOf(right)).toBe('right');
    const centred = groupLines([...typed('AAAAAA', 100, 300), ...typed('BB', 112, 286)], 0, decode);
    expect(alignmentOf(centred)).toBe('center');
  });
});

describe('the text frame', () => {
  it('round-trips a point through a rotated frame', () => {
    const angle = Math.PI / 3;
    const point = { x: 123.4, y: 56.7 };
    const back = fromFrame(toFrame(point, angle), angle);
    expect(back.x).toBeCloseTo(point.x, 9);
    expect(back.y).toBeCloseTo(point.y, 9);
  });
});

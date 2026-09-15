import { describe, expect, it } from 'vitest';
import { applyDifferences, baseEncodingTable, isBaseEncodingName } from './encodings';
import { characterOfGlyphName } from './glyph-names';

describe('baseEncodingTable', () => {
  it('reads WinAnsi as Windows-1252, curly quotes and the euro included', () => {
    const table = baseEncodingTable('WinAnsiEncoding');
    expect(table[0x41]).toBe('A');
    expect(table[0x93]).toBe('“');
    expect(table[0x80]).toBe('€');
    expect(table[0xe9]).toBe('é');
    // The five holes in Windows-1252 show nothing.
    expect(table[0x81]).toBeUndefined();
  });

  it("reads Standard's 0x27 as a curly apostrophe and its high half by Adobe's table", () => {
    const table = baseEncodingTable('StandardEncoding');
    expect(table[0x27]).toBe('’');
    expect(table[0x60]).toBe('‘');
    expect(table[0xae]).toBe('ﬁ');
    expect(table[0xd0]).toBe('—');
    expect(table[0xe9]).toBe('Ø');
    expect(table[0xe0]).toBeUndefined();
  });

  it('reads MacRoman through the platform decoder', () => {
    expect(baseEncodingTable('MacRomanEncoding')[0x8e]).toBe('é');
  });

  it('hands out a fresh copy each time, so patching one never leaks', () => {
    const first = baseEncodingTable('WinAnsiEncoding');
    first[0x41] = 'Z';
    expect(baseEncodingTable('WinAnsiEncoding')[0x41]).toBe('A');
  });

  it('knows which names are encodings', () => {
    expect(isBaseEncodingName('WinAnsiEncoding')).toBe(true);
    expect(isBaseEncodingName('Identity-H')).toBe(false);
  });
});

describe('applyDifferences', () => {
  it('patches codes from each number onward with the named glyphs', () => {
    const table = baseEncodingTable('WinAnsiEncoding');
    const { unknownNames } = applyDifferences(table, [
      65,
      'bullet',
      'endash',
      200,
      'uni2122',
      'g123',
    ]);
    expect(table[65]).toBe('•');
    expect(table[66]).toBe('–');
    expect(table[200]).toBe('™');
    expect(table[201]).toBeUndefined();
    expect(unknownNames).toEqual(['g123']);
  });
});

describe('characterOfGlyphName', () => {
  it('knows ASCII, Latin-1, typographic, and ligature names', () => {
    expect(characterOfGlyphName('quoteright')).toBe('’');
    expect(characterOfGlyphName('eacute')).toBe('é');
    expect(characterOfGlyphName('fl')).toBe('ﬂ');
    expect(characterOfGlyphName('section')).toBe('§');
    expect(characterOfGlyphName('zero')).toBe('0');
  });

  it('decodes uniXXXX and uXXXXX names by pattern', () => {
    expect(characterOfGlyphName('uni00A7')).toBe('§');
    expect(characterOfGlyphName('u1F600')).toBe('😀');
    expect(characterOfGlyphName('nonsense')).toBeUndefined();
  });
});

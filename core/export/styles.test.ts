import { describe, expect, it } from 'vitest';
import { halfPoints, hexColor, readableFamily, runStyleFor, wordFontFor } from './styles';

const font = (name: string, family = 'serif', flags = { bold: false, italic: false }) => ({
  name,
  family,
  ...flags,
});

describe('wordFontFor', () => {
  it.each([
    ['ABCDEF+TimesNewRomanPSMT', 'Times New Roman'],
    ['Times-Roman', 'Times New Roman'],
    ['ArialMT', 'Arial'],
    ['Helvetica-Bold', 'Arial'],
    ['Calibri-Light', 'Calibri'],
    ['CourierNewPS-BoldMT', 'Courier New'],
    ['CenturySchoolbook', 'Century Schoolbook'],
    ['Garamond-Italic', 'Garamond'],
  ])('%s → %s', (name, expected) => {
    expect(wordFontFor(font(name))).toBe(expected);
  });

  it('passes an unknown but readable name to Word as a name', () => {
    expect(wordFontFor(font('ABCDEF+MinionPro-Regular'))).toBe('Minion');
    expect(wordFontFor(font('BaskervilleOldFace'))).toBe('Baskerville Old Face');
  });

  it('falls back to the family when the name says nothing', () => {
    expect(wordFontFor(font('', 'sans-serif'))).toBe('Arial');
    expect(wordFontFor(font('F1', 'monospace'))).toBe('Courier New');
    expect(wordFontFor(font('', 'serif'))).toBe('Times New Roman');
  });
});

describe('readableFamily', () => {
  it('spaces camel case and drops vendor suffixes', () => {
    expect(readableFamily('ABCDEF+MinionPro-BoldIt')).toBe('Minion');
    expect(readableFamily('BookAntiqua,Bold')).toBe('Book Antiqua');
  });
});

describe('runStyleFor', () => {
  it('reads bold and italic off the name', () => {
    expect(runStyleFor(font('TimesNewRomanPS-BoldItalicMT'))).toEqual({
      wordFont: 'Times New Roman',
      bold: true,
      italic: true,
    });
    expect(runStyleFor(font('Arial,Bold'))).toMatchObject({ bold: true, italic: false });
    expect(runStyleFor(font('Helvetica-Oblique'))).toMatchObject({ bold: false, italic: true });
  });

  it('believes pdfjs when it flags a face bold', () => {
    expect(runStyleFor(font('Mystery', 'serif', { bold: true, italic: false })).bold).toBe(true);
  });
});

describe('sizes and colours', () => {
  it('rounds to the nearest half point, in half-points', () => {
    expect(halfPoints(12)).toBe(24);
    expect(halfPoints(11.2)).toBe(22);
    expect(halfPoints(9.74)).toBe(19);
  });

  it('normalises a hex colour and defaults to black', () => {
    expect(hexColor('#1a2b3c')).toBe('1A2B3C');
    expect(hexColor('ff0000')).toBe('FF0000');
    expect(hexColor('red')).toBe('000000');
    expect(hexColor(undefined)).toBe('000000');
  });
});

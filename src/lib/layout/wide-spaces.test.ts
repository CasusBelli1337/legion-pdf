import { describe, expect, it } from 'vitest';
import { extractPageLayout } from './extract-page-layout';
import type { PageLike } from './extract-page-layout';
import { glyphShape, withWideSpaces } from './wide-spaces';

const SPACE = { unicode: ' ', isSpace: true };
/** Glyphs the way pdfjs hands them to a show-text operator: letters, spaces, kerning numbers. */
const glyphs = (text: string): unknown[] =>
  [...text].flatMap((char): unknown[] => (char === ' ' ? [SPACE, 0.2] : [{ unicode: char }]));

describe('glyphShape', () => {
  it('counts letters and notes where two spaces were typed, kerning aside', () => {
    expect(glyphShape(glyphs('the Trust.  I took note'))).toEqual({
      letters: 17,
      doubled: [8],
      endsSpaced: false,
    });
  });

  it('counts a run of three spaces once', () => {
    expect(glyphShape(glyphs('ab   cd')).doubled).toEqual([2]);
  });

  it('sees a pair of spaces that straddles two operators', () => {
    const first = glyphShape(glyphs('ends here. '));
    expect(first.endsSpaced).toBe(true);
    expect(glyphShape(glyphs(' Next'), first.endsSpaced).doubled).toEqual([0]);
  });

  it('answers nothing for an operator with no glyph list', () => {
    expect(glyphShape(undefined)).toEqual({ letters: 0, doubled: [], endsSpaced: false });
  });
});

describe('withWideSpaces', () => {
  const shapes = [glyphShape(glyphs('before the Court.  I have')), glyphShape(glyphs('a.m.  The'))];

  it('puts the second space back where the operators drew two', () => {
    const items = [{ str: 'before the Court. I have' }, { str: 'a.m. The' }];
    expect(withWideSpaces(items, shapes)).toEqual(['before the Court.  I have', 'a.m.  The']);
  });

  it('follows the letters across items split differently from the operators', () => {
    const items = [{ str: 'before the ' }, { str: 'Court. I have a.m. The' }];
    expect(withWideSpaces(items, shapes)).toEqual(['before the ', 'Court.  I have a.m.  The']);
  });

  it('leaves the text alone where it has no space at that spot', () => {
    const items = [{ str: 'beforetheCourt.Ihave' }, { str: 'a.m. The' }];
    expect(withWideSpaces(items, shapes)[0]).toBe('beforetheCourt.Ihave');
  });

  const at = (str: string, x: number, width: number, y = 669) => ({
    str,
    transform: [12, 0, 0, 12, x, y],
    width,
    height: 12,
  });

  it('carries a pair that falls between two items at the end of the first', () => {
    const items = [
      at('before the Court.', 92, 90),
      at(' ', 182, 0.6),
      at('I have a.m. The', 188, 80),
    ];
    expect(withWideSpaces(items, shapes)).toEqual(['before the Court.  ', ' ', 'I have a.m.  The']);
  });

  it('does not, where the next item starts a space away, sits against it, or is on another line', () => {
    const oneSpace = [at('before the Court.', 92, 90), at('I have a.m. The', 185, 80)];
    expect(withWideSpaces(oneSpace, shapes)[0]).toBe('before the Court.');
    // "e-mail)" + ":" with the pair typed after the colon: the letters say the same thing.
    const colon = [
      at('before the Court', 92, 86),
      at('.', 178, 3),
      at('I have a.m. The', 92, 80, 645),
    ];
    expect(withWideSpaces(colon, shapes).slice(0, 2)).toEqual(['before the Court', '.']);
    const wrapped = [at('before the Court.', 92, 90), at('I have a.m. The', 92, 80, 645)];
    expect(withWideSpaces(wrapped, shapes)[0]).toBe('before the Court.');
  });

  it('drops a pair that opens the page: no item holds the text before it', () => {
    expect(withWideSpaces([{ str: 'Next line' }], [glyphShape(glyphs('  Next line'))])).toEqual([
      'Next line',
    ]);
  });

  it('hands the strings back untouched when nothing was doubled', () => {
    expect(withWideSpaces([{ str: 'one two' }], [glyphShape(glyphs('one two'))])).toEqual([
      'one two',
    ]);
  });
});

describe('extractPageLayout on a line typed with two spaces after a sentence', () => {
  const OPS = { showText: 4 };
  const store = { has: () => true, get: () => ({ name: 'Century' }) };
  const typedPage: PageLike = {
    view: [0, 0, 612, 792],
    rotate: 0,
    getTextContent: () =>
      Promise.resolve({
        items: [
          {
            str: 'I signed the lease. It was late.',
            transform: [12, 0, 0, 12, 92, 669],
            width: 190,
            height: 12,
            fontName: 'f1',
          },
        ],
        styles: {},
      }),
    getOperatorList: () =>
      Promise.resolve({
        fnArray: [OPS.showText],
        argsArray: [[glyphs('I signed the lease.  It was late.')]],
      }),
    commonObjs: store,
    objs: store,
  };

  it('keeps both spaces in the run, so the line is as wide in Word as it was typed', async () => {
    const layout = await extractPageLayout(typedPage, {
      page: 1,
      ops: OPS,
      roles: new Map(),
      printedPageNumber: null,
      rasterize: () => Promise.resolve(null),
    });
    expect(layout.runs.map((run) => run.text)).toEqual(['I signed the lease.  It was late.']);
  });
});

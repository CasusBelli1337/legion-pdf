import { describe, expect, it } from 'vitest';
import { describePaper, mixedSizeNotice, pageSizeRule } from './print-layout';

const LETTER = { width: 612, height: 792 };
const LEGAL = { width: 612, height: 1008 };
const LANDSCAPE = { width: 792, height: 612 };

describe('pageSizeRule', () => {
  it('names the paper in points so Chromium never has to guess', () => {
    expect(pageSizeRule(LETTER)).toBe('@page { size: 612pt 792pt; margin: 0; }');
  });

  it('carries a Legal page through at its own height', () => {
    expect(pageSizeRule(LEGAL)).toBe('@page { size: 612pt 1008pt; margin: 0; }');
  });

  // A rotated page arrives from pdfjs already swapped, so landscape must stay
  // landscape in the rule — printing it portrait is what letterboxes the page.
  it('keeps a landscape page landscape', () => {
    expect(pageSizeRule(LANDSCAPE)).toBe('@page { size: 792pt 612pt; margin: 0; }');
  });

  it('rounds a fractional page box to hundredths of a point', () => {
    expect(pageSizeRule({ width: 595.2756, height: 841.8898 })).toBe(
      '@page { size: 595.28pt 841.89pt; margin: 0; }'
    );
  });

  // Loud, not silent: a zero-size rule would print every page on a blank sheet.
  it.each([
    ['zero width', { width: 0, height: 792 }],
    ['a negative height', { width: 612, height: -1 }],
    ['a height that is not a number', { width: 612, height: Number.NaN }],
  ])('refuses %s', (_label, size) => {
    expect(() => pageSizeRule(size)).toThrow(/no printable/);
  });
});

describe('describePaper', () => {
  it('speaks in inches', () => {
    expect(describePaper(LETTER)).toBe('8.5 × 11 in');
    expect(describePaper(LEGAL)).toBe('8.5 × 14 in');
  });
});

describe('mixedSizeNotice', () => {
  it('says nothing about a document that is all one size', () => {
    expect(mixedSizeNotice([LETTER, LETTER, LETTER])).toBeNull();
  });

  it('says nothing about a single page', () => {
    expect(mixedSizeNotice([LEGAL])).toBeNull();
  });

  it('says nothing about a document with no pages at all', () => {
    expect(mixedSizeNotice([])).toBeNull();
  });

  it('ignores the fractions pdfjs reports on a nominally identical page', () => {
    expect(mixedSizeNotice([LETTER, { width: 612.2, height: 791.8 }])).toBeNull();
  });

  it('warns, in the attorney’s own units, when a Legal exhibit is mixed in', () => {
    expect(mixedSizeNotice([LETTER, LEGAL])).toBe(
      'Pages are not all one size — every sheet prints at 8.5 × 11 in.'
    );
  });

  // The status footer truncates and has no tooltip, so the whole sentence has
  // to fit on one line next to the filename/page/zoom fields.
  it('stays short enough to read in the status footer', () => {
    expect(mixedSizeNotice([LETTER, LEGAL])?.length).toBeLessThanOrEqual(70);
  });

  it('catches a rotated page among portrait ones', () => {
    expect(mixedSizeNotice([LETTER, LANDSCAPE])).toMatch(/not all one size/);
  });
});

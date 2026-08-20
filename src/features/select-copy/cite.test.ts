import { describe, expect, it } from 'vitest';
import { citeForSelection, formatCite } from './cite';
import { classifyPage } from './page-classifier';
import {
  condensedSheet,
  plainPage,
  pleadingPage,
  selectWholePage,
  selectWhere,
} from './synthetic-pages';

const TESTIMONY = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'Q. Did you review the trust instrument before signing?',
  'A. I did not.',
  'Q. Did anyone read it to you?',
  'A. No one did.',
  'Q. And you signed it anyway?',
  'A. I signed where I was told to sign.',
];

function citeFor(pages: Parameters<typeof citeForSelection>[0], prefix?: string): string | null {
  return citeForSelection(pages, prefix).cite?.formatted ?? null;
}

describe('cite formatting', () => {
  it('writes the shapes a brief uses', () => {
    expect(formatCite({ startPage: 5, startLine: 10, endPage: 5, endLine: 15 })).toBe('(5:10-15)');
    expect(formatCite({ startPage: 5, startLine: 10, endPage: 5, endLine: 10 })).toBe('(5:10)');
    expect(formatCite({ startPage: 5, startLine: 10, endPage: 6, endLine: 2 })).toBe('(5:10-6:2)');
    expect(formatCite({ startPage: 12, startLine: null, endPage: 12, endLine: null })).toBe('(12)');
    expect(formatCite({ startPage: 12, startLine: null, endPage: 14, endLine: null })).toBe(
      '(12-14)'
    );
  });

  it('degrades to the page when only one end has a line number', () => {
    expect(formatCite({ startPage: 5, startLine: 10, endPage: 6, endLine: null })).toBe('(5:10-6)');
    expect(formatCite({ startPage: 5, startLine: null, endPage: 5, endLine: 15 })).toBe('(5:15)');
  });

  it('puts the document source label in front when one is set', () => {
    const range = { startPage: 5, startLine: 10, endPage: 5, endLine: 15 };
    expect(formatCite(range, 'Rothrock Decl.')).toBe('(Rothrock Decl. 5:10-15)');
    expect(formatCite(range, '  Rothrock Decl.  ')).toBe('(Rothrock Decl. 5:10-15)');
    expect(formatCite(range, '')).toBe('(5:10-15)');
    expect(formatCite({ startPage: 5, startLine: 10, endPage: 6, endLine: 2 }, 'Ex. 4')).toBe(
      '(Ex. 4 5:10-6:2)'
    );
  });
});

describe('cites from a selection', () => {
  it('cites the PRINTED page and the margin lines the selection spans', () => {
    const page = classifyPage(pleadingPage({ page: 12, printed: 10, lines: TESTIMONY }));
    const selection = selectWhere(
      page,
      (text) => text.startsWith('Q. Did you') || text === 'A. No one did.'
    );

    expect(citeFor([selection])).toBe('(10:10-13)');
  });

  it('cites a single line as one number', () => {
    const page = classifyPage(pleadingPage({ page: 12, printed: 10, lines: TESTIMONY }));
    const selection = selectWhere(page, (text) => text === 'A. I did not.');

    expect(citeFor([selection])).toBe('(10:11)');
  });

  it('cites across pages', () => {
    const first = classifyPage(pleadingPage({ page: 12, printed: 10, lines: TESTIMONY }));
    const second = classifyPage(
      pleadingPage({ page: 13, printed: 11, lines: ['', 'A. That is correct.'] })
    );
    const selection = [
      selectWhere(first, (text) => text.startsWith('Q. And you signed')),
      selectWhere(second, (text) => text === 'A. That is correct.'),
    ];

    expect(citeFor(selection)).toBe('(10:14-11:2)');
  });

  it('cites the page alone when the document has no margin numbers', () => {
    const page = classifyPage(plainPage(12, ['A paragraph with no line numbers at all.'], 12));
    expect(citeFor([selectWholePage(page)])).toBe('(12)');
  });

  it('cites the mini-page of a condensed sheet, not the sheet', () => {
    const sheet = classifyPage(
      condensedSheet(3, [
        { number: 41, lines: ['alpha', 'alpha two'] },
        { number: 42, lines: ['bravo'] },
        { number: 43, lines: ['charlie'] },
        { number: 44, lines: ['delta'] },
      ])
    );
    const selection = selectWhere(sheet, (text) => text === 'bravo' || text === 'charlie');

    expect(citeFor([selection])).toBe('(42:1-43:1)');
  });

  it('gives no cite at all rather than a guessed one', () => {
    const page = classifyPage(pleadingPage({ page: 12, lines: TESTIMONY }));
    expect(citeForSelection([selectWholePage(page)]).cite).toBeNull();
  });

  it('marks a soft page number so the menu can warn', () => {
    const page = classifyPage(plainPage(7, ['A paragraph from volume three.'], 412));
    const result = citeForSelection([selectWholePage(page)]);

    expect(result.cite?.formatted).toBe('(412)');
    expect(result.confidence).toBe('low');
  });

  it('carries the source label into the formatted cite', () => {
    const page = classifyPage(pleadingPage({ page: 12, printed: 10, lines: TESTIMONY }));
    const selection = selectWhere(page, (text) => text === 'A. I did not.');

    expect(citeFor([selection], 'Rothrock Decl.')).toBe('(Rothrock Decl. 10:11)');
  });
});

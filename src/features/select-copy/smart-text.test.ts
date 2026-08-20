import { describe, expect, it } from 'vitest';
import { classifyPage } from './page-classifier';
import { smartTextFor } from './smart-text';
import {
  condensedSheet,
  pageOf,
  plainPage,
  pleadingPage,
  selectWholePage,
  selectWhere,
} from './synthetic-pages';

function copiedFrom(input: ReturnType<typeof pleadingPage>): string {
  return smartTextFor([selectWholePage(classifyPage(input))]);
}

describe('smart text', () => {
  it('drops the margin numbers, the running head, the stamp and the page number', () => {
    const text = copiedFrom(
      pleadingPage({
        page: 3,
        printed: 1,
        lines: ['The witness answered as follows.'],
        header: 'ASHFORD v. ASHFORD',
        bates: 'ASHFORD000123',
      })
    );

    expect(text).toBe('The witness answered as follows.');
    expect(text).not.toMatch(/\d/);
  });

  it('joins the lines of a paragraph with spaces, not newlines', () => {
    const text = copiedFrom(
      pleadingPage({
        page: 3,
        printed: 1,
        lines: [
          'The witness testified that he had never seen',
          'the document before the deposition and that no',
          'one at the company had shown it to him.',
        ],
      })
    );

    expect(text).toBe(
      'The witness testified that he had never seen the document before the ' +
        'deposition and that no one at the company had shown it to him.'
    );
    expect(text).not.toContain('\n');
  });

  it('puts a word broken across a line back together', () => {
    const text = copiedFrom(
      pleadingPage({
        page: 3,
        printed: 1,
        lines: ['Counsel agreed the exhibit would be submit-', 'ted with the reply brief.'],
      })
    );

    expect(text).toBe('Counsel agreed the exhibit would be submitted with the reply brief.');
  });

  it('keeps a paragraph break where the page has one', () => {
    const text = copiedFrom(
      pleadingPage({
        page: 3,
        printed: 1,
        lines: [
          'The first paragraph runs to the end of its line here.',
          'It continues onto a second line of the same paragraph.',
          '',
          'The second paragraph starts after a blank line.',
        ],
        indented: [4],
      })
    );

    expect(text.split('\n\n')).toHaveLength(2);
    expect(text.startsWith('The first paragraph')).toBe(true);
    expect(text.endsWith('The second paragraph starts after a blank line.')).toBe(true);
  });

  it('joins runs inside one line without inventing or losing spaces', () => {
    const page = classifyPage(
      pageOf(1, [
        { text: 'The witness', x: 90, y: 700 },
        { text: 'testified plainly', x: 154, y: 700 },
        { text: 'about the meeting.', x: 251, y: 700 },
      ])
    );

    expect(smartTextFor([selectWholePage(page)])).toBe(
      'The witness testified plainly about the meeting.'
    );
  });

  it('does not split a word that pdfjs split for a font change', () => {
    const page = classifyPage(
      pageOf(1, [
        { text: 'The ', x: 90, y: 700 },
        { text: 'emphas', x: 112, y: 700 },
        { text: 'ised', x: 145, y: 700 },
        { text: ' word.', x: 167, y: 700 },
      ])
    );

    expect(smartTextFor([selectWholePage(page)])).toBe('The emphasised word.');
  });

  it('reads a condensed sheet mini-page by mini-page, not across the sheet', () => {
    const sheet = condensedSheet(1, [
      { number: 41, lines: ['alpha first line', 'alpha second line'] },
      { number: 42, lines: ['bravo first line'] },
      { number: 43, lines: ['charlie first line'] },
      { number: 44, lines: ['delta first line'] },
    ]);
    const text = smartTextFor([selectWholePage(classifyPage(sheet))]);

    expect(text).toBe(
      'alpha first line alpha second line bravo first line charlie first line delta first line'
    );
  });

  it('copies only what was selected', () => {
    const page = classifyPage(
      pleadingPage({
        page: 3,
        printed: 1,
        lines: ['wanted text here', 'unwanted text here'],
      })
    );

    expect(smartTextFor([selectWhere(page, (text) => text.startsWith('wanted'))])).toBe(
      'wanted text here'
    );
  });

  it('runs a sentence straight across a page break', () => {
    const first = classifyPage(plainPage(1, ['The parties agreed that the settlement']));
    const second = classifyPage(plainPage(2, ['would be paid in three instalments.']));

    expect(smartTextFor([selectWholePage(second), selectWholePage(first)])).toBe(
      'The parties agreed that the settlement would be paid in three instalments.'
    );
  });

  it('returns nothing at all rather than a stray fragment for an empty selection', () => {
    const page = classifyPage(pleadingPage({ page: 3, printed: 1, lines: [] }));
    expect(smartTextFor([selectWholePage(page)])).toBe('');
  });
});

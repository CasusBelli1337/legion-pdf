/**
 * "Match document text" against the font names real PDFs actually carry.
 *
 * The names below are taken from files this app is built for: Word output
 * (TimesNewRomanPSMT, Calibri), court e-filing stamps (Courier New), scanned
 * exhibits run through Acrobat, and the base-14 faces pdf-lib itself writes.
 */

import { describe, expect, it } from 'vitest';
import { fontChoiceFor, matchDocumentFont, stripSubsetPrefix } from './font-match';

const CASES: readonly [string, string | undefined, string, boolean, boolean][] = [
  // name, pdfjs fallback, expected family, bold, italic
  ['ABCDEF+TimesNewRomanPSMT', 'serif', 'times', false, false],
  ['TimesNewRomanPS-BoldMT', 'serif', 'times', true, false],
  ['TimesNewRomanPS-ItalicMT', 'serif', 'times', false, true],
  ['TimesNewRomanPS-BoldItalicMT', 'serif', 'times', true, true],
  ['Times-Roman', 'serif', 'times', false, false],
  ['ArialMT', 'sans-serif', 'helvetica', false, false],
  ['Arial-BoldMT', 'sans-serif', 'helvetica', true, false],
  ['Helvetica-BoldOblique', 'sans-serif', 'helvetica', true, true],
  ['Calibri-Light', 'sans-serif', 'helvetica', false, false],
  ['SegoeUI-Semibold', 'sans-serif', 'helvetica', true, false],
  ['CourierNewPSMT', 'monospace', 'courier', false, false],
  ['CourierNewPS-BoldMT', 'monospace', 'courier', true, false],
  ['Consolas-Italic', 'monospace', 'courier', false, true],
  ['LiberationSerif-Italic', 'serif', 'times', false, true],
  ['Cambria', 'serif', 'times', false, false],
  ['Garamond-Bold', 'serif', 'times', true, false],
  ['CenturySchoolbook', 'serif', 'times', false, false],
  ['CenturyGothic', 'sans-serif', 'helvetica', false, false],
  ['DejaVuSansMono', 'monospace', 'courier', false, false],
  ['MinionPro-Regular', 'serif', 'times', false, false],
];

describe('mapping a document font onto a built-in face', () => {
  it.each(CASES)('%s → %s', (name, fallback, family, bold, italic) => {
    const choice = fontChoiceFor(fallback === undefined ? { name } : { name, fallback });
    expect(choice.family).toBe(family);
    expect(choice.bold === true).toBe(bold);
    expect(choice.italic === true).toBe(italic);
  });

  it('falls back to pdfjs family when the name says nothing', () => {
    expect(fontChoiceFor({ name: 'g_d0_f1', fallback: 'monospace' }).family).toBe('courier');
    expect(fontChoiceFor({ name: 'AAAAAA+F1', fallback: 'serif' }).family).toBe('times');
    expect(fontChoiceFor({ name: '', fallback: 'sans-serif' }).family).toBe('helvetica');
  });

  it('reaches for Helvetica only when nothing at all is known', () => {
    expect(fontChoiceFor({ name: '' }).family).toBe('helvetica');
  });

  it('drops the subset prefix embedded fonts carry', () => {
    expect(stripSubsetPrefix('ABCDEF+TimesNewRomanPSMT')).toBe('TimesNewRomanPSMT');
    expect(stripSubsetPrefix('TimesNewRomanPSMT')).toBe('TimesNewRomanPSMT');
    expect(stripSubsetPrefix('Abcdef+Weird')).toBe('Abcdef+Weird');
  });
});

describe('what the attorney is told', () => {
  it('names the real font and admits the substitution', () => {
    const match = matchDocumentFont({ name: 'ABCDEF+TimesNewRomanPSMT', fallback: 'serif' });
    expect(match.documentFont).toBe('TimesNewRomanPSMT');
    expect(match.exact).toBe(false);
    expect(match.note).toBe(
      'This document uses TimesNewRomanPSMT — using Times, the closest built-in match.'
    );
  });

  it('never pretends an exotic font was matched', () => {
    const match = matchDocumentFont({ name: 'MinionPro-BoldIt', fallback: 'serif' });
    expect(match.exact).toBe(false);
    expect(match.note).toContain('MinionPro-BoldIt');
    expect(match.note).toContain('Times bold italic');
    expect(match.note).toContain('closest built-in match');
  });

  it('says so plainly when the document is already in a built-in face', () => {
    const match = matchDocumentFont({ name: 'Helvetica', fallback: 'sans-serif' });
    expect(match.exact).toBe(true);
    expect(match.note).toBe('This document uses Helvetica — the same font Librarius types in.');
  });

  it('admits when the file records no name for the face', () => {
    const match = matchDocumentFont({ name: '', fallback: 'monospace' });
    expect(match.documentFont).toBe('');
    expect(match.note).toContain('no font name in the file');
    expect(match.note).toContain('Courier');
  });

  it('carries the sampled size across, rounded to a tenth of a point', () => {
    expect(matchDocumentFont({ name: 'ArialMT', sizePt: 11.9999 }).sizePt).toBe(12);
    expect(matchDocumentFont({ name: 'ArialMT', sizePt: 0 }).sizePt).toBeUndefined();
    expect(matchDocumentFont({ name: 'ArialMT' }).sizePt).toBeUndefined();
  });
});

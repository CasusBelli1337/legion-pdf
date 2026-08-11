import { describe, expect, it } from 'vitest';
import { DATE_FORMATS, DEFAULT_DATE_FORMAT, formatDateStamp } from './date-stamp';

/** 10 August 2026 — local time, which is the date the attorney signed on. */
const DAY = new Date(2026, 7, 10);
const MARCH = new Date(2026, 2, 3);

describe('formatDateStamp', () => {
  it('renders every pattern the panel offers', () => {
    expect(formatDateStamp(DAY, 'MM/DD/YYYY')).toBe('08/10/2026');
    expect(formatDateStamp(DAY, 'DD/MM/YYYY')).toBe('10/08/2026');
    expect(formatDateStamp(DAY, 'YYYY-MM-DD')).toBe('2026-08-10');
    expect(formatDateStamp(DAY, 'MMMM D, YYYY')).toBe('August 10, 2026');
  });

  it('does not rewrite letters inside a month name', () => {
    expect(formatDateStamp(MARCH, 'MMMM D, YYYY')).toBe('March 3, 2026');
    expect(formatDateStamp(new Date(2026, 11, 1), 'MMMM D, YYYY')).toBe('December 1, 2026');
  });

  it('falls back to the default rather than interpreting a pattern it was not given', () => {
    expect(formatDateStamp(DAY)).toBe('08/10/2026');
    expect(formatDateStamp(DAY, '   ')).toBe('08/10/2026');
    expect(formatDateStamp(DAY, 'Dated: MM/DD/YYYY')).toBe('08/10/2026');
  });

  it('offers the default among its formats', () => {
    expect(DATE_FORMATS).toContain(DEFAULT_DATE_FORMAT);
  });
});

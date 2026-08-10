import { describe, expect, it } from 'vitest';
import { describePart, parseRangeInput } from './range-input';

describe('parseRangeInput', () => {
  it('turns each comma-separated group into its own output document', () => {
    const result = parseRangeInput('1-30, 31-60', 60);

    expect(result.error).toBeNull();
    expect(result.parts.map((part) => part.spec)).toEqual(['1-30', '31-60']);
    expect(result.parts.map((part) => part.pageCount)).toEqual([30, 30]);
  });

  it('accepts a single page as a range of one', () => {
    const result = parseRangeInput('7', 10);

    expect(result.error).toBeNull();
    expect(result.parts).toEqual([{ spec: '7', first: 7, last: 7, pageCount: 1 }]);
  });

  it('asks for input in plain English when the box is empty', () => {
    expect(parseRangeInput('   ', 10).error).toBe(
      'Type the page ranges you want to split into, for example 1-30, 31-60.'
    );
  });

  it('explains a range that runs past the end of the document', () => {
    expect(parseRangeInput('1-30, 31-99', 60).error).toBe(
      'This document ends at page 60, so "31-99" is out of range.'
    );
  });

  it('explains a backwards range and how to fix it', () => {
    expect(parseRangeInput('30-1', 60).error).toBe(
      'The range "30-1" runs backwards. Write it as 1-30.'
    );
  });

  it('explains text that is not a page range', () => {
    expect(parseRangeInput('first thirty', 60).error).toBe(
      '"first thirty" is not a page number or a range. Type page numbers, for example 1-30, 31-60.'
    );
  });

  it('refuses page zero', () => {
    expect(parseRangeInput('0-5', 60).error).toBe('Pages start at 1.');
  });

  it('returns no parts whenever there is an error', () => {
    expect(parseRangeInput('1-30, oops', 60).parts).toEqual([]);
  });
});

describe('describePart', () => {
  it('reads like a sentence for a range and for a single page', () => {
    const [range] = parseRangeInput('1-30', 60).parts;
    const [single] = parseRangeInput('4', 60).parts;

    expect(range === undefined ? '' : describePart(range)).toBe('Pages 1-30 (30 pages)');
    expect(single === undefined ? '' : describePart(single)).toBe('Page 4 (1 page)');
  });
});

import { describe, expect, it } from 'vitest';
import { isRangeCollapseError } from '@shared/types';
import type { RedactApplyOptions, RedactionBox, TextMatch } from '@shared/types';
import { instancesByString, planRedactions, verificationStrings } from './plan';
import { NoRedactionMarksError, RedactionGeometryError } from './types';

function box(page: number, id = `${page}`, text?: string, index = 0): RedactionBox {
  const base: RedactionBox = { id, page, rect: { x: 10, y: 10, width: 50, height: 12 } };
  if (text === undefined) return base;
  return { ...base, sourceMatch: { page, text, index, quads: [base.rect] } };
}

function options(boxes: RedactionBox[], verifyStrings: string[] = []): RedactApplyOptions {
  return { boxes, dpi: 300, reOcr: false, verifyStrings };
}

describe('planRedactions', () => {
  it('groups marks by the page they destroy', () => {
    const plan = planRedactions(options([box(3, 'a'), box(1, 'b'), box(3, 'c')]), 5);
    expect(plan.pages).toEqual([1, 3]);
    expect(plan.marksByPage.get(3)).toHaveLength(2);
    expect(plan.markCount).toBe(3);
  });

  it('counts hand-drawn boxes as one instance each', () => {
    expect(planRedactions(options([box(1, 'a'), box(2, 'b')]), 3).instanceCount).toBe(2);
  });

  it('counts the several marks of ONE search hit as ONE instance', () => {
    // pdfjs splits a text run across items, so "SSN 545-45-6789" arrives as
    // three quads. A receipt claiming three instances would be quoted in a
    // declaration and be wrong.
    const hit: TextMatch = { page: 1, text: 'SSN 545-45-6789', index: 0, quads: [] };
    const boxes: RedactionBox[] = ['a', 'b', 'c'].map((id) => ({
      id,
      page: 1,
      rect: { x: 1, y: 1, width: 10, height: 10 },
      sourceMatch: hit,
    }));
    const plan = planRedactions(options(boxes), 3);
    expect(plan.markCount).toBe(3);
    expect(plan.instanceCount).toBe(1);
  });

  it('counts two hits of the same term as two instances', () => {
    const plan = planRedactions(options([box(1, 'a', 'SSN 1'), box(4, 'b', 'SSN 1')]), 5);
    expect(plan.instanceCount).toBe(2);
  });

  it('refuses to run with nothing marked', () => {
    expect(() => planRedactions(options([]), 5)).toThrow(NoRedactionMarksError);
  });

  it('collapses loudly when every marked page is outside the document', () => {
    let thrown: unknown;
    try {
      planRedactions(options([box(9), box(12)]), 4);
    } catch (error) {
      thrown = error;
    }
    expect(isRangeCollapseError(thrown)).toBe(true);
  });

  it('never silently drops the marks it could not place', () => {
    expect(() => planRedactions(options([box(1), box(99)]), 4)).toThrow(
      /outside this 4-page document/
    );
  });

  it('refuses a mark with no area', () => {
    const flat: RedactionBox = { id: 'z', page: 1, rect: { x: 1, y: 1, width: 0, height: 10 } };
    expect(() => planRedactions(options([flat]), 2)).toThrow(RedactionGeometryError);
  });

  it('refuses a DPI that cannot rasterize anything', () => {
    expect(() => planRedactions({ ...options([box(1)]), dpi: 0 }, 2)).toThrow(RangeError);
  });

  it('refuses a fractional page number', () => {
    const odd: RedactionBox = { id: 'q', page: 1.5, rect: { x: 1, y: 1, width: 5, height: 5 } };
    expect(() => planRedactions(options([odd]), 3)).toThrow();
  });
});

/**
 * The count verification is measured against: how many copies of a term the
 * attorney asked to destroy. Marking one instance of a term the document holds
 * five times must report ONE, or the verification demands the destruction of
 * four copies nobody marked.
 */
describe('instancesByString', () => {
  it('counts one per marked hit, keyed by the lowercased term', () => {
    const marks = [box(1, 'a', 'SSN 545-45-6789', 0), box(4, 'b', 'ssn 545-45-6789', 1)];
    expect(instancesByString(marks)).toEqual(new Map([['ssn 545-45-6789', 2]]));
  });

  it('counts the several marks of ONE hit as one instance', () => {
    const marks = ['a', 'b', 'c'].map((id) => box(1, id, 'SSN 545-45-6789', 7));
    expect(instancesByString(marks).get('ssn 545-45-6789')).toBe(1);
  });

  it('keeps terms apart', () => {
    const marks = [box(1, 'a', 'SSN 1', 0), box(2, 'b', 'ACCT-2', 1), box(3, 'c', 'ACCT-2', 2)];
    expect(instancesByString(marks)).toEqual(
      new Map([
        ['ssn 1', 1],
        ['acct-2', 2],
      ])
    );
  });

  it('contributes nothing for a hand-drawn box, which names no term', () => {
    expect(instancesByString([box(1, 'a')])).toEqual(new Map());
  });

  it('rides on the plan, so the verifier never has to re-derive it', () => {
    const plan = planRedactions(options([box(1, 'a', 'SSN 1', 0), box(4, 'b', 'SSN 1', 1)]), 5);
    expect(plan.markedInstances.get('ssn 1')).toBe(2);
  });
});

describe('verificationStrings', () => {
  it('adds the text of every search hit that was marked', () => {
    const plan = planRedactions(options([box(1, 'a', 'SSN 545-45-6789')]), 2);
    expect(plan.strings).toEqual(['SSN 545-45-6789']);
  });

  it('merges caller-supplied strings with search hits and de-duplicates', () => {
    const strings = verificationStrings(
      options([box(1, 'a', 'ACCT-99887766'), box(2, 'b', 'acct-99887766')], ['ACCT-99887766'])
    );
    expect(strings).toEqual(['ACCT-99887766']);
  });

  it('ignores blank entries rather than verifying against an empty string', () => {
    expect(verificationStrings(options([box(1)], ['   ', '']))).toEqual([]);
  });
});

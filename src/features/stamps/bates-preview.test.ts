import { describe, expect, it } from 'vitest';
import {
  BATES_PREFIX_PLACEHOLDER,
  batesLabelAt,
  batesProblem,
  batesReceipt,
  DEFAULT_BATES_FORM,
  previewBates,
  toBatesOptions,
  type BatesForm,
} from './bates-preview';

function form(overrides: Partial<BatesForm> = {}): BatesForm {
  return { ...DEFAULT_BATES_FORM, prefix: 'ASHFORD', startNumber: 123, ...overrides };
}

describe('the prefix box', () => {
  it('starts empty, so nothing is stamped that was not typed', () => {
    expect(DEFAULT_BATES_FORM.prefix).toBe('');
  });

  it('shows a neutral example, never a real case name', () => {
    expect(BATES_PREFIX_PLACEHOLDER).toBe('PLAINTIFF');
  });
});

describe('batesLabelAt', () => {
  it('produces the exact production string', () => {
    expect(batesLabelAt(form(), 0)).toBe('ASHFORD000123');
    expect(batesLabelAt(form(), 19)).toBe('ASHFORD000142');
    expect(batesLabelAt(form({ padWidth: 0 }), 0)).toBe('ASHFORD123');
    expect(batesLabelAt(form({ prefix: '' }), 0)).toBe('000123');
  });

  it('never shows a number the main process would refuse to draw', () => {
    expect(batesLabelAt(form({ padWidth: -4 }), 0)).toBe('ASHFORD123');
    expect(batesLabelAt(form({ startNumber: 1.7 }), 0)).toBe('ASHFORD000001');
  });
});

describe('batesProblem', () => {
  it('passes a sensible form', () => {
    expect(batesProblem(form())).toBeNull();
  });

  it('names the field to fix', () => {
    expect(batesProblem(form({ prefix: 'x'.repeat(40) }))).toMatch(/prefix/);
    expect(batesProblem(form({ startNumber: -1 }))).toMatch(/whole number/);
    expect(batesProblem(form({ padWidth: 20 }))).toMatch(/0 to 12/);
    expect(batesProblem(form({ fontSize: 0 }))).toMatch(/size above zero/);
    expect(batesProblem(form({ margin: -1 }))).toMatch(/margin/);
  });
});

describe('previewBates', () => {
  it('shows the first and last string of the run', () => {
    const preview = previewBates(form(), [1, 2, 3, 4, 5]);
    expect(preview.first).toBe('ASHFORD000123');
    expect(preview.last).toBe('ASHFORD000127');
    expect(preview.summary).toBe('ASHFORD000123 through ASHFORD000127, on 5 pages.');
  });

  it('does not pretend a single page is a range', () => {
    expect(previewBates(form(), [7]).summary).toBe('ASHFORD000123, on 1 page.');
  });

  it('says so when nothing is selected', () => {
    expect(previewBates(form(), []).summary).toBe('No pages selected.');
  });
});

describe('batesReceipt', () => {
  it('reports what actually landed, from the main process detail', () => {
    expect(batesReceipt(['ASHFORD000001', 'ASHFORD000002'])).toMatch(
      /Stamped ASHFORD000001 through ASHFORD000002 on 2 pages/
    );
    expect(batesReceipt(['ASHFORD000001'])).toMatch(/Stamped ASHFORD000001 on 1 page/);
    expect(batesReceipt([])).toBe('No pages were numbered.');
  });
});

describe('toBatesOptions', () => {
  it('hands the main process exactly what the form says', () => {
    expect(toBatesOptions(form({ position: 'top-left' }), [1, 2])).toEqual({
      prefix: 'ASHFORD',
      startNumber: 123,
      padWidth: 6,
      pages: [1, 2],
      position: 'top-left',
      fontSize: 10,
      margin: 36,
      whiteBackingBox: false,
    });
  });
});

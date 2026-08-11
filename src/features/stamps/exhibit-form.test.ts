import { describe, expect, it } from 'vitest';
import {
  EXHIBIT_START,
  afterExhibitStamp,
  editExhibit,
  slipSheetIndex,
  slipSheetReceipt,
} from './exhibit-form';
import type { ExhibitPanelState, SlipSheetPlacement } from './exhibit-form';

function state(overrides: Partial<ExhibitPanelState['form']> = {}): ExhibitPanelState {
  return { ...EXHIBIT_START, form: { ...EXHIBIT_START.form, ...overrides } };
}

describe('afterExhibitStamp', () => {
  it('counts the next label from the label that was applied', () => {
    expect(afterExhibitStamp(state(), 'EXHIBIT A').form.label).toBe('EXHIBIT B');
    expect(afterExhibitStamp(state(), 'Exhibit 7').form.label).toBe('Exhibit 8');
  });

  // The owner-reported bug: he stamped EXHIBIT A and the page read EXHIBIT B,
  // because the advanced label was previewed straight back over the new stamp.
  it('takes the preview down so the page shows the stamp it just received', () => {
    expect(afterExhibitStamp(state(), 'EXHIBIT A').showPreview).toBe(false);
  });

  it('leaves a label with nothing to count on alone', () => {
    const after = afterExhibitStamp(state({ label: 'PLAINTIFF EXHIBIT' }), 'PLAINTIFF EXHIBIT');
    expect(after.form.label).toBe('PLAINTIFF EXHIBIT');
    expect(after.showPreview).toBe(false);
  });
});

describe('editExhibit', () => {
  it('brings the preview back, because an edit is not applied yet', () => {
    const stamped = afterExhibitStamp(state(), 'EXHIBIT A');
    const edited = editExhibit(stamped, { fontSize: 18 });
    expect(edited.showPreview).toBe(true);
    expect(edited.form.fontSize).toBe(18);
    expect(edited.form.label).toBe('EXHIBIT B');
  });
});

describe('slipSheetIndex', () => {
  const placement = (slipSheetPlacement: SlipSheetPlacement, slipSheetAt = 1) => ({
    slipSheetPlacement,
    slipSheetAt,
  });

  it('puts a sheet before the page on screen at that page number', () => {
    expect(slipSheetIndex(placement('before'), 7, 10)).toBe(7);
  });

  it('puts a sheet after the page on screen one further on', () => {
    expect(slipSheetIndex(placement('after'), 7, 10)).toBe(8);
  });

  it('handles both ends of the document', () => {
    expect(slipSheetIndex(placement('before'), 1, 10)).toBe(1);
    expect(slipSheetIndex(placement('after'), 10, 10)).toBe(11);
    expect(slipSheetIndex(placement('before'), 10, 10)).toBe(10);
    expect(slipSheetIndex(placement('after'), 1, 1)).toBe(2);
  });

  it('never runs past the ends on a page number it cannot trust', () => {
    expect(slipSheetIndex(placement('after'), 99, 10)).toBe(11);
    expect(slipSheetIndex(placement('before'), 0, 10)).toBe(1);
    expect(slipSheetIndex(placement('at', 99), 1, 10)).toBe(11);
    expect(slipSheetIndex(placement('at', -3), 1, 10)).toBe(1);
  });

  it('takes the typed number when the placement is a page number', () => {
    expect(slipSheetIndex(placement('at', 4), 7, 10)).toBe(4);
  });
});

describe('slipSheetReceipt', () => {
  it('reports where the sheet ended up', () => {
    expect(slipSheetReceipt('EXHIBIT A', 8)).toMatch(/"EXHIBIT A" sheet as page 8/);
  });
});

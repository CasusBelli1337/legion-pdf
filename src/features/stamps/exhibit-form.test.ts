import { describe, expect, it } from 'vitest';
// The main-process handler file as TEXT: this zone may read it, never import it.
import handlers from '../../../electron/ipc/stamp.ts?raw';
import {
  EXHIBIT_START,
  EXHIBIT_TAG,
  SLIP_SHEET_TAG,
  afterExhibitStamp,
  afterHistoryStep,
  editExhibit,
  labelFromTag,
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

describe('the border default', () => {
  // The owner's ask: the bare label is the stamp, and a box he did not ask for
  // had to be switched off on every document.
  it('is off', () => {
    expect(EXHIBIT_START.form.bordered).toBe(false);
  });

  it('puts a slip-sheet label in the middle of the sheet unless told otherwise', () => {
    expect(EXHIBIT_START.form.slipSheetPosition).toBe('center');
  });
});

describe('labelFromTag', () => {
  it('reads the label out of a stamp tag and a slip-sheet tag', () => {
    expect(labelFromTag(`${EXHIBIT_TAG}EXHIBIT C`)).toBe('EXHIBIT C');
    expect(labelFromTag(`${SLIP_SHEET_TAG}Exhibit 12`)).toBe('Exhibit 12');
  });

  it('is not fooled by another op, or by no tag at all', () => {
    expect(labelFromTag(undefined)).toBeNull();
    expect(labelFromTag('watermark')).toBeNull();
    expect(labelFromTag('highlight')).toBeNull();
    expect(labelFromTag(EXHIBIT_TAG)).toBeNull();
  });
});

describe('afterHistoryStep', () => {
  const undo = (label: string) => ({ direction: 'undo' as const, tag: `${EXHIBIT_TAG}${label}` });
  const redo = (label: string) => ({ direction: 'redo' as const, tag: `${EXHIBIT_TAG}${label}` });

  it('puts the label back to the one the undo took off the page', () => {
    const after = afterHistoryStep(state({ label: 'EXHIBIT C' }), undo('EXHIBIT B'));
    expect(after.form.label).toBe('EXHIBIT B');
    expect(after.showPreview).toBe(true);
  });

  /** The owner's case: A, B, C stamped, three undos, and the box reads A again. */
  it('walks a whole run back one undo at a time', () => {
    let panel = state({ label: 'EXHIBIT D' });
    for (const label of ['EXHIBIT C', 'EXHIBIT B', 'EXHIBIT A']) {
      panel = afterHistoryStep(panel, undo(label));
      expect(panel.form.label).toBe(label);
    }
    expect(panel.form.label).toBe('EXHIBIT A');
  });

  it('re-advances past a label the attorney redid', () => {
    const rolled = afterHistoryStep(state({ label: 'EXHIBIT D' }), undo('EXHIBIT C'));
    const redone = afterHistoryStep(rolled, redo('EXHIBIT C'));
    expect(redone.form.label).toBe('EXHIBIT D');
    expect(redone.showPreview).toBe(false);
  });

  it('walks back a slip sheet exactly as it walks back a stamp', () => {
    const after = afterHistoryStep(state({ label: 'EXHIBIT B' }), {
      direction: 'undo',
      tag: `${SLIP_SHEET_TAG}EXHIBIT A`,
    });
    expect(after.form.label).toBe('EXHIBIT A');
  });

  it('leaves the panel untouched — the same object — for anything else', () => {
    const panel = state({ label: 'EXHIBIT D' });
    expect(afterHistoryStep(panel, { direction: 'undo' })).toBe(panel);
    expect(afterHistoryStep(panel, { direction: 'undo', tag: 'highlight' })).toBe(panel);
    expect(afterHistoryStep(panel, { direction: 'redo', tag: 'rotate' })).toBe(panel);
  });

  it('changes nothing but the label — position, size, and range stay put', () => {
    const panel = state({ label: 'EXHIBIT C', fontSize: 65, margin: 24, range: '2-4' });
    const after = afterHistoryStep(panel, undo('EXHIBIT B'));
    expect(after.form).toEqual({ ...panel.form, label: 'EXHIBIT B' });
  });
});

/**
 * #seam:label-undo-tag drift-guard. The tags are written in the main process
 * and read here, with no shared symbol between the two zones — so the guard is
 * that both files carry the marker and the same two literals.
 */
describe('the tag seam with the main process', () => {
  it('is marked on the main-process side too', () => {
    expect(handlers).toContain('#seam:label-undo-tag');
  });

  it('spells the tags the same way on both sides', () => {
    expect(handlers).toContain(`EXHIBIT_TAG = '${EXHIBIT_TAG}'`);
    expect(handlers).toContain(`SLIP_SHEET_TAG = '${SLIP_SHEET_TAG}'`);
  });

  it('tags the stamp and the slip sheet when it stores their bytes', () => {
    expect(handlers).toMatch(/IPC\.stamp\.exhibit,[\s\S]{0,600}\$\{EXHIBIT_TAG\}/);
    expect(handlers).toMatch(/IPC\.stamp\.slipSheet,[\s\S]{0,400}\$\{SLIP_SHEET_TAG\}/);
  });
});

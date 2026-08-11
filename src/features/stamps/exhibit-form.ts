/**
 * The exhibit panel's state, as plain data — kept out of the component so the
 * two things an attorney can get burned by are unit-tested:
 *
 * 1. WHAT STAMPS IS WHAT HE TYPED. The label advances after a stamp lands, and
 *    the advanced label must never be previewed back over the ink just applied:
 *    the preview sits in the same corner, at the same size, on a white box, so
 *    "EXHIBIT A" applied under "EXHIBIT B" previewed reads as the wrong letter.
 * 2. WHERE A SLIP SHEET LANDS. "Before this page" and "after this page" are one
 *    apart, and both ends of the document are off-by-one traps.
 */

import type { ExhibitPosition } from '@shared/types';
import { nextExhibitLabel } from './exhibit-label';

/** Where a slip sheet goes: around the page on screen, or at a typed number. */
export type SlipSheetPlacement = 'before' | 'after' | 'at';

export interface ExhibitForm {
  label: string;
  position: ExhibitPosition;
  fontSize: number;
  margin: number;
  bordered: boolean;
  /** The page-range box: "all", "1-30, 45". */
  range: string;
  slipSheetPlacement: SlipSheetPlacement;
  /** The typed page number, used when the placement is 'at'. */
  slipSheetAt: number;
}

export interface ExhibitPanelState {
  form: ExhibitForm;
  /** False right after a stamp lands: the ink on the page is the preview now. */
  showPreview: boolean;
}

export const EXHIBIT_START: ExhibitPanelState = {
  form: {
    label: 'EXHIBIT A',
    position: 'bottom-right',
    fontSize: 14,
    margin: 24,
    bordered: true,
    range: '1',
    slipSheetPlacement: 'before',
    slipSheetAt: 1,
  },
  showPreview: true,
};

/** Any edit brings the preview back: it now shows something not yet applied. */
export function editExhibit(
  state: ExhibitPanelState,
  patch: Partial<ExhibitForm>
): ExhibitPanelState {
  return { form: { ...state.form, ...patch }, showPreview: true };
}

/**
 * After a stamp lands. The next label is counted from the label that was
 * ACTUALLY applied, and the preview stands down until the attorney changes
 * something — so the page shows the stamp it just received, not the next one.
 */
export function afterExhibitStamp(
  state: ExhibitPanelState,
  appliedLabel: string
): ExhibitPanelState {
  const next = nextExhibitLabel(appliedLabel);
  return {
    form: { ...state.form, ...(next === null ? {} : { label: next }) },
    showPreview: false,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(Math.trunc(value), low), high);
}

/**
 * The 1-based index a slip sheet occupies after insertion — what
 * `stamp:slipSheet` takes. "Before page 1" is 1; "after the last page" is one
 * past the end, which is the only index that adds a sheet at the back.
 */
export function slipSheetIndex(
  form: Pick<ExhibitForm, 'slipSheetPlacement' | 'slipSheetAt'>,
  currentPage: number,
  pageCount: number
): number {
  const last = Math.max(1, pageCount);
  if (form.slipSheetPlacement === 'at') return clamp(form.slipSheetAt, 1, last + 1);
  const page = clamp(currentPage, 1, last);
  return form.slipSheetPlacement === 'after' ? page + 1 : page;
}

/** Plain English for the footer: where the sheet ended up, not what was asked. */
export function slipSheetReceipt(label: string, index: number): string {
  return `Added a "${label}" sheet as page ${index}. Save the document to keep it.`;
}

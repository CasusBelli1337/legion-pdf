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
 * 3. WHERE THE SEQUENCE IS. Undo takes the stamp off the page, so the label has
 *    to walk back with it — three undos after A, B, C leaves the box on A.
 */

import type { ExhibitPosition, SlipSheetPosition } from '@shared/types';
import { nextExhibitLabel } from './exhibit-label';

/** Where a slip sheet goes: around the page on screen, or at a typed number. */
export type SlipSheetPlacement = 'before' | 'after' | 'at';

/** Every placement core can stamp, in the order the panel offers them. */
export const EXHIBIT_POSITIONS: readonly ExhibitPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'bottom-center',
];

/** The same, plus the middle of an otherwise blank divider page. */
export const SLIP_SHEET_POSITIONS: readonly SlipSheetPosition[] = ['center', ...EXHIBIT_POSITIONS];

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
  /** Where the label sits on the divider page itself. */
  slipSheetPosition: SlipSheetPosition;
  /** The label's size ON THE SHEET — a divider page reads best big (36pt classic). */
  slipSheetFontSize: number;
}

export interface ExhibitPanelState {
  form: ExhibitForm;
  /** False right after a stamp lands: the ink on the page is the preview now. */
  showPreview: boolean;
}

/**
 * The code defaults. The border is OFF: the owner's exhibit stamps are the bare
 * label, and a box nobody asked for has to be turned off on every document.
 * What the attorney actually chooses is remembered (./stamp-settings) and comes
 * back over these on the next launch.
 */
export const EXHIBIT_START: ExhibitPanelState = {
  form: {
    label: 'EXHIBIT A',
    position: 'bottom-right',
    fontSize: 14,
    margin: 24,
    bordered: false,
    range: '1',
    slipSheetPlacement: 'before',
    slipSheetAt: 1,
    slipSheetPosition: 'center',
    slipSheetFontSize: 36,
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

/**
 * #seam:label-undo-tag — the op tags `electron/ipc/stamp.ts` puts on the bytes
 * it stores for a stamp and a slip sheet. The renderer is not allowed to import
 * a main-process module, so the two sides are bound by these exact strings and
 * by the drift-guard in ./exhibit-form.test.ts, which reads both files.
 */
export const EXHIBIT_TAG = 'exhibit:';
export const SLIP_SHEET_TAG = 'slipsheet:';

/** The label an op tag carries, or null when the tag is not one of ours. */
export function labelFromTag(tag: string | undefined): string | null {
  for (const prefix of [EXHIBIT_TAG, SLIP_SHEET_TAG]) {
    if (tag?.startsWith(prefix) !== true) continue;
    const label = tag.slice(prefix.length).trim();
    return label.length === 0 ? null : label;
  }
  return null;
}

export interface HistoryStep {
  direction: 'undo' | 'redo';
  /** The op tag of the change that moved; undefined when it carried none. */
  tag?: string;
}

/**
 * The panel after an undo or redo stepped over a labelled change.
 *
 * Undo took "EXHIBIT B" off the page, so the box goes back to EXHIBIT B and the
 * preview comes back — that label is once again something not yet applied.
 * Redo put it back, so the box moves on to EXHIBIT C and the preview stands
 * down. Anything else (a rotate, a watermark, an untagged op) moves nothing:
 * the SAME state is returned, so the panel does not even re-render.
 */
export function afterHistoryStep(state: ExhibitPanelState, step: HistoryStep): ExhibitPanelState {
  const label = labelFromTag(step.tag);
  if (label === null) return state;
  if (step.direction === 'undo') return { form: { ...state.form, label }, showPreview: true };
  return afterExhibitStamp(state, label);
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

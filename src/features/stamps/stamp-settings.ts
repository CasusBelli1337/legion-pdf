/**
 * What the stamping panels remember between sessions.
 *
 * The owner's rule: whatever settings an attorney sets, he probably wants them
 * moving forward. A prefix typed once, a corner chosen once, a text size dialled
 * in once — none of it should have to be redone on the next document, let alone
 * the next launch.
 *
 * Only the settings travel. The page range and where a slip sheet goes are
 * facts about the document on screen, not preferences, so they always start
 * fresh — carrying "pages 1-30" onto a four-page exhibit would be a trap.
 *
 * Everything here degrades to the code defaults: a missing, stale, or corrupt
 * entry produces exactly the form a first run produces (see ../../lib/persisted-settings).
 */

import type { Corner } from '@shared/types';
import { field, persistedSetting, storedFields } from '@renderer/lib/persisted-settings';
import { BATES_CORNERS, DEFAULT_BATES_FORM, type BatesForm } from './bates-preview';
import {
  EXHIBIT_POSITIONS,
  EXHIBIT_START,
  SLIP_SHEET_POSITIONS,
  type ExhibitForm,
  type ExhibitPanelState,
} from './exhibit-form';

/** The exhibit settings that travel — the next label included. */
export type ExhibitMemory = Pick<
  ExhibitForm,
  | 'label'
  | 'position'
  | 'fontSize'
  | 'margin'
  | 'bordered'
  | 'slipSheetPosition'
  | 'slipSheetFontSize'
>;

/** The Bates settings that travel. `startNumber` comes back exactly as it was. */
export type BatesMemory = Pick<
  BatesForm,
  'prefix' | 'startNumber' | 'padWidth' | 'position' | 'fontSize' | 'margin' | 'whiteBackingBox'
>;

const FONT_RANGE = { min: 4, max: 72 };
const MARGIN_RANGE = { min: 0, max: 200 };
const PAD_RANGE = { min: 0, max: 12 };
const START_RANGE = { min: 0, max: 1_000_000_000 };
const MAX_LABEL = 64;
const MAX_PREFIX = 32;

function text(fields: Record<string, unknown>, key: string, fallback: string, max: number): string {
  const value = field.text(fields, key, fallback);
  return value.length > max ? fallback : value;
}

export function parseExhibitMemory(raw: unknown): ExhibitMemory {
  const fields = storedFields(raw);
  const start = EXHIBIT_START.form;
  return {
    label: text(fields, 'label', start.label, MAX_LABEL),
    position: field.choice(fields, 'position', EXHIBIT_POSITIONS, start.position),
    fontSize: field.number(fields, 'fontSize', start.fontSize, FONT_RANGE),
    margin: field.number(fields, 'margin', start.margin, MARGIN_RANGE),
    bordered: field.flag(fields, 'bordered', start.bordered),
    slipSheetPosition: field.choice(
      fields,
      'slipSheetPosition',
      SLIP_SHEET_POSITIONS,
      start.slipSheetPosition
    ),
    slipSheetFontSize: field.number(
      fields,
      'slipSheetFontSize',
      start.slipSheetFontSize,
      FONT_RANGE
    ),
  };
}

export function parseBatesMemory(raw: unknown): BatesMemory {
  const fields = storedFields(raw);
  const start = DEFAULT_BATES_FORM;
  const startNumber = field.number(fields, 'startNumber', start.startNumber, START_RANGE);
  return {
    prefix: text(fields, 'prefix', start.prefix, MAX_PREFIX),
    startNumber: Math.trunc(startNumber),
    padWidth: Math.trunc(field.number(fields, 'padWidth', start.padWidth, PAD_RANGE)),
    position: field.choice<Corner>(fields, 'position', BATES_CORNERS, start.position),
    fontSize: field.number(fields, 'fontSize', start.fontSize, FONT_RANGE),
    margin: field.number(fields, 'margin', start.margin, MARGIN_RANGE),
    whiteBackingBox: field.flag(fields, 'whiteBackingBox', start.whiteBackingBox),
  };
}

export const exhibitMemory = persistedSetting('exhibit-stamp', 1, parseExhibitMemory);
export const batesMemory = persistedSetting('bates-numbering', 1, parseBatesMemory);

/** The exhibit panel's opening state: code defaults, with what was remembered over them. */
export function startingExhibitState(): ExhibitPanelState {
  return { form: { ...EXHIBIT_START.form, ...exhibitMemory.read() }, showPreview: true };
}

export function rememberExhibit(form: ExhibitForm): void {
  exhibitMemory.write({
    label: form.label,
    position: form.position,
    fontSize: form.fontSize,
    margin: form.margin,
    bordered: form.bordered,
    slipSheetPosition: form.slipSheetPosition,
    slipSheetFontSize: form.slipSheetFontSize,
  });
}

export function startingBatesForm(): BatesForm {
  return { ...DEFAULT_BATES_FORM, ...batesMemory.read() };
}

export function rememberBates(form: BatesForm): void {
  batesMemory.write({
    prefix: form.prefix,
    startNumber: form.startNumber,
    padWidth: form.padWidth,
    position: form.position,
    fontSize: form.fontSize,
    margin: form.margin,
    whiteBackingBox: form.whiteBackingBox,
  });
}

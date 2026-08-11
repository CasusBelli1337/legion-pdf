/**
 * The Bates panel's arithmetic, kept out of the component so the exact string
 * the attorney is about to burn into a production can be unit-tested.
 *
 * The panel shows the FIRST and LAST number of the run before anything is
 * applied, because that pair is what gets typed into a cover letter — and a
 * production numbered one digit off is a re-production.
 */

import type { BatesOptions, Corner } from '@shared/types';
import { describePageCount } from './page-range';

export interface BatesForm {
  prefix: string;
  startNumber: number;
  padWidth: number;
  position: Corner;
  fontSize: number;
  margin: number;
  whiteBackingBox: boolean;
  /** The range box: "all", "1-30, 45". */
  range: string;
}

/**
 * The example shown in the empty prefix box. It is a placeholder, so it must
 * never be a real case name — an attorney reading someone else's matter name in
 * his own production is a confidentiality problem, not a typo.
 */
export const BATES_PREFIX_PLACEHOLDER = 'PLAINTIFF';

export const DEFAULT_BATES_FORM: BatesForm = {
  prefix: '',
  startNumber: 1,
  padWidth: 6,
  position: 'bottom-right',
  fontSize: 10,
  margin: 36,
  whiteBackingBox: false,
  range: 'all',
};

const MAX_PREFIX = 32;
const MAX_PAD = 12;

/** The exact string page `index` of the run will carry. */
export function batesLabelAt(form: BatesForm, index: number): string {
  const number = Math.max(0, Math.trunc(form.startNumber)) + index;
  const width = Math.min(MAX_PAD, Math.max(0, Math.trunc(form.padWidth)));
  return `${form.prefix}${String(number).padStart(width, '0')}`;
}

/** What is wrong with the form, in the words needed to fix it. */
export function batesProblem(form: BatesForm): string | null {
  if (form.prefix.length > MAX_PREFIX) {
    return `Keep the prefix to ${MAX_PREFIX} characters or fewer.`;
  }
  if (!Number.isInteger(form.startNumber) || form.startNumber < 0) {
    return 'The starting number has to be a whole number, 0 or more.';
  }
  if (!Number.isInteger(form.padWidth) || form.padWidth < 0 || form.padWidth > MAX_PAD) {
    return `Zero-padding runs from 0 to ${MAX_PAD} digits.`;
  }
  if (!(form.fontSize > 0)) return 'The number has to have a size above zero.';
  if (!(form.margin >= 0)) return 'The margin cannot be negative.';
  return null;
}

export interface BatesPreview {
  first: string;
  last: string;
  /** "ASHFORD000001 through ASHFORD000020, on 20 pages". */
  summary: string;
  problem: string | null;
}

export function previewBates(form: BatesForm, pages: readonly number[]): BatesPreview {
  const first = batesLabelAt(form, 0);
  const last = batesLabelAt(form, Math.max(0, pages.length - 1));
  const problem = batesProblem(form);
  const range = pages.length < 2 ? first : `${first} through ${last}`;
  return {
    first,
    last,
    summary:
      pages.length === 0
        ? 'No pages selected.'
        : `${range}, on ${describePageCount(pages.length)}.`,
    problem,
  };
}

/** The receipt after a run — the same sentence, in the past tense. */
export function batesReceipt(applied: readonly string[]): string {
  const first = applied[0];
  const last = applied[applied.length - 1];
  if (first === undefined || last === undefined) return 'No pages were numbered.';
  const range = applied.length < 2 ? first : `${first} through ${last}`;
  return `Stamped ${range} on ${describePageCount(applied.length)}. Save the document to keep it.`;
}

/** The form as the main process wants it. */
export function toBatesOptions(form: BatesForm, pages: number[]): BatesOptions {
  return {
    prefix: form.prefix,
    startNumber: form.startNumber,
    padWidth: form.padWidth,
    pages,
    position: form.position,
    fontSize: form.fontSize,
    margin: form.margin,
    whiteBackingBox: form.whiteBackingBox,
  };
}

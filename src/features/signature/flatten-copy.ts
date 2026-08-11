/**
 * The words on the flatten dialog, in one place.
 *
 * This is the sentence an attorney reads immediately before their signature
 * stops being something they can undo, so it is pinned by a test rather than
 * left to drift across a refactor.
 */

/** Runs of this size or smaller finish faster than a progress bar can be read. */
export const PROGRESS_THRESHOLD = 2;

/** The exact question the attorney is asked to agree to. */
export function flattenQuestion(count: number): string {
  const noun = count === 1 ? 'signature' : 'signatures';
  return `Permanently place ${count} ${noun} into the document? They can't be moved or removed after this.`;
}

/** The heading above it. */
export function flattenHeading(count: number): string {
  return count === 1
    ? 'Place this signature into the document?'
    : 'Place these signatures into the document?';
}

/** What Cancel means, said plainly so nobody has to guess. */
export const FLATTEN_CANCEL_NOTE =
  'Cancel keeps them where they are, so you can keep moving them. Nothing is saved either way until you choose.';

export const FLATTEN_CONFIRM_LABEL = 'Place and save';

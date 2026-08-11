/**
 * The one moment a live signature becomes part of the file: saving.
 *
 * Everything before this is reversible — the attorney can drag, resize, or
 * delete a placed signature all day. Saving is not reversible, so saving a
 * document that carries live placements ASKS FIRST, and a "no" cancels the
 * save outright rather than quietly writing an unsigned file.
 *
 * `runFlatten` is the decision by itself, with the confirm, the write, and the
 * progress line handed in — so the confirm path, the cancel path, and the
 * nothing-to-do path are unit-tested without a window, a modal, or a PDF.
 * `flattenSignaturesFor` is that decision bound to the real app.
 */

import { describeError } from '@renderer/features/stamps/use-stamp-runner';
import { useAppStore } from '@renderer/app/store';
import { placementsFor, usePlacementStore, type LivePlacement } from './placement-store';

export type FlattenOutcome = 'nothing-to-do' | 'flattened' | 'cancelled' | 'failed';

/**
 * Whether the save that asked for this flatten may go ahead. Cancelling or
 * failing stops the save: an attorney who backed out of "place them
 * permanently" did not ask for a file without their signature in it.
 */
export const SAVE_MAY_PROCEED: Record<FlattenOutcome, boolean> = {
  'nothing-to-do': true,
  flattened: true,
  cancelled: false,
  failed: false,
};

export interface FlattenDeps {
  placements: readonly LivePlacement[];
  /** Asks the attorney. False means place nothing and save nothing. */
  confirm(count: number): Promise<boolean>;
  /** Writes ONE placement into the document's bytes. */
  place(placement: LivePlacement): Promise<void>;
  /** Movement while it works: "signature 2 of 5". */
  report?(current: number, total: number): void;
}

export interface FlattenResult {
  outcome: FlattenOutcome;
  /** How many reached the bytes. On a failure this is the partial count. */
  placed: number;
  error: string | null;
}

/** Sequential on purpose: each write takes the previous write's bytes. */
export async function runFlatten(deps: FlattenDeps): Promise<FlattenResult> {
  const total = deps.placements.length;
  if (total === 0) return { outcome: 'nothing-to-do', placed: 0, error: null };
  if (!(await deps.confirm(total))) return { outcome: 'cancelled', placed: 0, error: null };

  let placed = 0;
  for (const placement of deps.placements) {
    deps.report?.(placed + 1, total);
    try {
      await deps.place(placement);
    } catch (caught) {
      return { outcome: 'failed', placed, error: describeError(caught) };
    }
    placed += 1;
  }
  return { outcome: 'flattened', placed, error: null };
}

/** What the attorney is told when a run stops part-way through. */
export function partialFailureMessage(result: FlattenResult, total: number): string {
  const landed =
    result.placed === 0
      ? 'No signatures were placed'
      : `${result.placed} of ${total} signatures were placed`;
  return `${landed}, and the document was not saved. ${result.error ?? ''} The rest are still on the page.`.trim();
}

/** True when this document is carrying signatures that are not in the file yet. */
export function hasLiveSignatures(docId: string): boolean {
  return placementsFor(usePlacementStore.getState().placements, docId).length > 0;
}

async function applyPlacement(docId: string, placement: LivePlacement): Promise<void> {
  await window.librarius.stamp.signaturePlace(docId, {
    signatureId: placement.signature.id,
    page: placement.page,
    at: placement.at,
    widthPt: placement.widthPt,
    heightPt: placement.heightPt,
    withDate: placement.withDate,
    dateFormat: placement.dateFormat,
  });
  // Dropped from the live set the instant it reaches the bytes: a run that
  // fails half way must not leave an already-written signature on the page for
  // a retry to write a second time.
  usePlacementStore.getState().remove(placement.id);
}

async function settle(docId: string, result: FlattenResult, total: number): Promise<boolean> {
  const store = useAppStore.getState();
  if (result.outcome === 'failed') {
    store.setError(partialFailureMessage(result, total));
  }
  if (result.outcome === 'flattened') {
    usePlacementStore.getState().clearDocument(docId);
    store.replaceSession(await window.librarius.file.read(docId));
    const plural = result.placed === 1 ? 'signature is' : 'signatures are';
    store.setNotice(`${result.placed} ${plural} now part of the document.`);
  }
  return SAVE_MAY_PROCEED[result.outcome];
}

/**
 * The save-flow hook. Returns true when the save may proceed — including the
 * ordinary case of a document with no live signatures at all, which never
 * raises a dialog and never touches the modal code.
 */
export async function flattenSignaturesFor(docId: string): Promise<boolean> {
  const placements = placementsFor(usePlacementStore.getState().placements, docId);
  if (placements.length === 0) return true;

  // Loaded here rather than at the top so the save path — which every document
  // takes — does not drag React DOM in for a dialog most saves never raise.
  const modal = await import('./flatten-confirm-host');
  const store = useAppStore.getState();
  try {
    const result = await runFlatten({
      placements,
      confirm: modal.askToFlatten,
      place: (placement) => applyPlacement(docId, placement),
      report: (current, total) => {
        modal.reportFlattenProgress(current, total);
        store.setBusy(`Placing signature ${current} of ${total}`);
      },
    });
    return await settle(docId, result, placements.length);
  } finally {
    modal.closeFlattenModal();
    store.setBusy(null);
  }
}

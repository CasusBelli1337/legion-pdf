/**
 * The two moments an attorney consents to destruction, as pure decisions.
 *
 * Redaction is the one operation in this app that cannot be undone (CLAUDE.md
 * rule 2), so nothing is destroyed until someone has read a sentence saying so
 * and pressed a button that says so. There are exactly two ways in:
 *
 *   1. The panel's "Redact and destroy" button — `withDestroyConsent`.
 *   2. Saving a document that still carries marks — `runRedactionGate`.
 *
 * Both are written here with the dialog, the destruction, and the save handed
 * in, so every branch is unit-tested without a window, a modal, or a PDF. The
 * bindings to the real app live in save-redaction-gate.ts and use-redaction.ts.
 */

import type { RedactionBox } from '@shared/types';

/** What the attorney chose at the save-time gate. */
export type RedactionGateChoice = 'apply' | 'save-anyway' | 'cancel';

/** Distinct pages carrying a mark — what both dialogs count "on M pages" from. */
function pageCount(marks: readonly RedactionBox[]): number {
  return new Set(marks.map((mark) => mark.page)).size;
}

/**
 * The panel path. Resolves true when the marked content was handed to the
 * destroy step, false when there was nothing marked or the attorney backed out.
 */
export async function withDestroyConsent(
  marks: readonly RedactionBox[],
  confirm: (count: number, pages: number) => Promise<boolean>,
  destroy: () => void
): Promise<boolean> {
  if (marks.length === 0) return false;
  if (!(await confirm(marks.length, pageCount(marks)))) return false;
  destroy();
  return true;
}

export interface RedactionGateDeps {
  /** Marks pending on the document being saved. Empty means an ordinary save. */
  marks: readonly RedactionBox[];
  /** Raises the three-way dialog. */
  ask(count: number, pages: number): Promise<RedactionGateChoice>;
  /**
   * Destroys the marked content and saves the REDACTED COPY where the attorney
   * chooses. The source document is deliberately left alone — see
   * save-redaction-gate.ts for which file ends up where.
   */
  applyAndSaveCopy(): Promise<void>;
}

/**
 * The save path. True means the save that asked for this gate may go ahead and
 * write the document as it stands.
 *
 * "Apply redactions now" returns FALSE on purpose: the redacted copy has
 * already been saved to its own destination, and letting the original save run
 * on afterwards would write the unredacted source over the file the attorney
 * just picked — the exact confusion this dialog exists to prevent.
 */
export async function runRedactionGate(deps: RedactionGateDeps): Promise<boolean> {
  if (deps.marks.length === 0) return true;

  const choice = await deps.ask(deps.marks.length, pageCount(deps.marks));
  if (choice === 'save-anyway') return true;
  if (choice === 'cancel') return false;

  await deps.applyAndSaveCopy();
  return false;
}

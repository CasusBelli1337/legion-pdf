/**
 * The redaction gate, bound to the real app — and the one place in this lane
 * where WHICH FILE ENDS UP WHERE has to be exactly right.
 *
 * Redaction never edits a document in place: it builds a NEW one and leaves the
 * source untouched (redacted-document.ts). So "Apply redactions now" at save
 * time cannot mean "save this document" — the redacted bytes are a different
 * document. What happens instead, in order:
 *
 *   1. The marked content is destroyed, producing a new, verified document that
 *      opens in its own tab.
 *   2. That REDACTED document is routed into Save As, so the attorney picks the
 *      destination for the file that actually leaves the building.
 *   3. The SOURCE document is not written, not marked clean, and stays open
 *      unredacted — which is exactly what the dialog says will happen.
 *
 * The gate then answers false, so the save that raised it does not run on and
 * write the unredacted source over the destination just chosen.
 *
 * Nothing here is loaded on an ordinary save: save-gates.ts only reaches for
 * this module when the document actually carries marks.
 */

import type { ProgressEvent, RedactionBox } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { applyRedaction } from './apply-redaction';
import { askAtSave, closeRedactConfirm, reportRedactProgress } from './redact-confirm-host';
import { runRedactionGate } from './redact-consent';
import {
  plainError,
  REDACTED_COPY_NOT_SAVED,
  redactedCopySaved,
  REDACTION_NOT_APPLIED_AT_SAVE,
} from './redact-messages';
import { useRedactionStore, verifyStringsOf } from './redaction-store';

/** "Deposition.pdf" → "Deposition (redacted).pdf" — a name nobody can mix up. */
export function redactedCopyName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName} (redacted)`;
  return `${fileName.slice(0, dot)} (redacted)${fileName.slice(dot)}`;
}

function sourceFileName(docId: string): string {
  const session = useAppStore.getState().sessions.find((item) => item.id === docId);
  return session?.fileName ?? 'Document.pdf';
}

/** The redacted document, and only it, goes to the attorney's chosen location. */
async function saveRedactedCopy(redactedId: string, suggestedName: string): Promise<void> {
  const store = useAppStore.getState();
  store.setBusy('Saving the redacted copy');
  try {
    const result = await window.librarius.file.saveAs(redactedId, suggestedName);
    if (result === null) {
      store.setNotice(REDACTED_COPY_NOT_SAVED);
      return;
    }
    store.replaceSession(await window.librarius.file.read(redactedId));
    store.setNotice(redactedCopySaved(result.filePath));
  } catch (error) {
    store.setError(`Could not save the redacted copy: ${plainError(error)}`);
  } finally {
    store.setBusy(null);
  }
}

/** Movement while the pages are rebuilt — the redaction panel may not be open. */
function streamProgressToDialog(docId: string): () => void {
  reportRedactProgress(null);
  return window.librarius.onProgress('redact:progress', (event: ProgressEvent) => {
    if (event.docId === docId) reportRedactProgress(event);
  });
}

async function destroy(docId: string, marks: readonly RedactionBox[]): Promise<string | null> {
  const request = {
    boxes: [...marks],
    verifyStrings: verifyStringsOf(marks),
    reOcr: useRedactionStore.getState().reOcr,
  };
  const stopProgress = streamProgressToDialog(docId);
  try {
    return await applyRedaction(docId, request);
  } finally {
    stopProgress();
    // Closed before Save As so the attorney can see the redacted tab behind the
    // location dialog — the file being named is the one on screen.
    closeRedactConfirm();
  }
}

async function destroyThenSaveCopy(docId: string, marks: readonly RedactionBox[]): Promise<void> {
  const redactedId = await destroy(docId, marks);
  if (redactedId === null) {
    // A failed redaction is never a quiet one, and it never saves anything.
    const failure = useRedactionStore.getState().run.error ?? REDACTION_NOT_APPLIED_AT_SAVE;
    useAppStore.getState().setError(failure);
    return;
  }
  await saveRedactedCopy(redactedId, redactedCopyName(sourceFileName(docId)));
}

/**
 * True when the save that asked for this gate may write the document as it
 * stands. False means it must not: the attorney cancelled, or the redacted copy
 * has already been saved in its place.
 */
export async function redactionGateFor(docId: string): Promise<boolean> {
  const state = useRedactionStore.getState();
  const marks = state.docId === docId ? state.marks : [];
  if (marks.length === 0) return true;

  try {
    return await runRedactionGate({
      marks,
      ask: askAtSave,
      applyAndSaveCopy: () => destroyThenSaveCopy(docId, marks),
    });
  } finally {
    closeRedactConfirm();
  }
}

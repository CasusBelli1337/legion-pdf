/**
 * Runs one stamping operation at a time and keeps the panel honest about it:
 * a plain-English label while it works, live "Page 12 / 65" off `stamp:progress`,
 * the receipt when it lands, and a plain-English error when it does not.
 *
 * Re-reading the session after every op is what swaps the new bytes into the
 * viewer, so the stamp appears without the attorney refreshing anything
 * (UI golden rule 3: refresh after mutation).
 */

import { useCallback, useEffect, useState } from 'react';
import { IPC } from '@shared/ipc';
import type { ProgressEvent } from '@shared/types';
import { useAppStore } from '@renderer/app/store';

export interface StampRunner {
  /** What is happening right now, or null when idle. */
  busy: string | null;
  progress: ProgressEvent | null;
  error: string | null;
  receipt: string | null;
  run(label: string, work: () => Promise<string>): Promise<void>;
  dismiss(): void;
}

/** Strips Electron's IPC wrapper so the attorney never sees a stack trace. */
export function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}

/** What an operation left behind: its receipt, or the reason it did not land. */
export type OpOutcome = { ok: true; receipt: string } | { ok: false; message: string };

/**
 * The completion path EVERY document edit shares, without the panel state — so
 * a caller that has no panel (the selection menu's Highlight) still lands in the
 * same place a stamp does: the new bytes re-read into the session, which
 * re-renders the page, carries the dirty flag over and re-enables Undo, plus a
 * receipt in the footer scoped to the document that earned it.
 *
 * Calling this directly rather than `window.librarius.stamp.*` is what stops an
 * edit from reaching the file while the screen says nothing happened (F-2).
 */
export async function runDocumentOp(
  docId: string,
  label: string,
  work: () => Promise<string>
): Promise<OpOutcome> {
  const store = useAppStore.getState();
  store.setBusy(label);
  try {
    const receipt = await work();
    const refreshed = useAppStore.getState();
    refreshed.replaceSession(await window.librarius.file.read(docId));
    refreshed.setNotice(receipt, docId);
    return { ok: true, receipt };
  } catch (caught) {
    const message = describeError(caught);
    useAppStore.getState().setError(message, docId);
    return { ok: false, message };
  } finally {
    useAppStore.getState().setBusy(null);
  }
}

export function useStampRunner(docId: string | null): StampRunner {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  // Subscribed only while an operation runs, so no stray event can report
  // progress on something that already finished.
  useEffect(() => {
    if (busy === null) return;
    return window.librarius.onProgress(IPC.stamp.progress, (event) => {
      if (event.docId === docId) setProgress(event);
    });
  }, [busy, docId]);

  const run = useCallback(
    async (label: string, work: () => Promise<string>): Promise<void> => {
      if (docId === null) return;
      setBusy(label);
      setError(null);
      setReceipt(null);
      setProgress(null);
      const outcome = await runDocumentOp(docId, label, work);
      if (outcome.ok) setReceipt(outcome.receipt);
      else setError(outcome.message);
      setBusy(null);
      setProgress(null);
    },
    [docId]
  );

  const dismiss = useCallback(() => {
    setError(null);
    setReceipt(null);
    useAppStore.getState().setError(null);
    useAppStore.getState().setNotice(null);
  }, []);

  return { busy, progress, error, receipt, run, dismiss };
}

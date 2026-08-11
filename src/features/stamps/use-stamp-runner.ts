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
      useAppStore.getState().setBusy(label);
      try {
        const message = await work();
        useAppStore.getState().replaceSession(await window.librarius.file.read(docId));
        setReceipt(message);
        useAppStore.getState().setNotice(message);
      } catch (caught) {
        setError(describeError(caught));
        useAppStore.getState().setError(describeError(caught));
      } finally {
        setBusy(null);
        setProgress(null);
        useAppStore.getState().setBusy(null);
      }
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

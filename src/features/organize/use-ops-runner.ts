/**
 * Runs one page operation at a time and keeps the panel honest about it:
 * a plain-English label while it works, live "Page 12 of 65" progress off
 * `ops:progress`, the result sentence when it lands, and a plain-English error
 * when it does not. Refreshing the session after every op is what swaps the new
 * bytes into the viewer (UI golden rule 3: refresh after mutation).
 */

import { useCallback, useEffect, useState } from 'react';
import { IPC } from '@shared/ipc';
import type { ProgressEvent } from '@shared/types';
import { useAppStore } from '../../app/store';
import { COMBINE_PROGRESS_ID, NEW_DOCUMENT_PHASE } from './new-documents';

export interface OpsRunner {
  /** What is happening right now, or null when idle. */
  busy: string | null;
  progress: ProgressEvent | null;
  error: string | null;
  notice: string | null;
  run(label: string, work: () => Promise<string>): Promise<void>;
  dismiss(): void;
}

/** Strips Electron's IPC wrapper so the attorney never sees a stack trace. */
function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}

export function useOpsRunner(docId: string | null): OpsRunner {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  // Only subscribed while an operation runs, so no event can arrive to report
  // progress on something that already finished.
  useEffect(() => {
    if (busy === null) return;
    return window.librarius.onProgress(IPC.ops.progress, (event) => {
      if (event.phase === NEW_DOCUMENT_PHASE) return;
      if (event.docId === docId || event.docId === COMBINE_PROGRESS_ID) setProgress(event);
    });
  }, [docId, busy]);

  const run = useCallback(
    async (label: string, work: () => Promise<string>): Promise<void> => {
      if (docId === null) return;
      setBusy(label);
      setError(null);
      setNotice(null);
      setProgress(null);
      const store = useAppStore.getState();
      store.setBusy(label);
      store.setNotice(null);
      store.setError(null);
      try {
        const result = await work();
        useAppStore.getState().replaceSession(await window.librarius.file.read(docId));
        setNotice(result);
        // Also to the footer: combine, split, and extract switch to the new tab,
        // which remounts this panel and would otherwise swallow the receipt.
        useAppStore.getState().setNotice(result);
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
    setNotice(null);
    useAppStore.getState().setNotice(null);
    useAppStore.getState().setError(null);
  }, []);

  return { busy, progress, error, notice, run, dismiss };
}

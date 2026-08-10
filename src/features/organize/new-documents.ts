// #seam:ops-new-document
/**
 * Combine, split, and extract produce WHOLE NEW documents. The IPC contract's
 * OpResult carries bytes but no document id, so the main process adopts the new
 * document into the store and announces it on `ops:progress` with the phase
 * below; this is the renderer half that opens it in a fresh tab.
 *
 * The main-process half is electron/ipc/ops.ts, which carries the same marker
 * and the same phrase — new-documents.test.ts fails if the two ever drift.
 */

import { IPC } from '@shared/ipc';
import type { ProgressEvent } from '@shared/types';
import { useAppStore } from '../../app/store';

export const NEW_DOCUMENT_PHASE = 'New document ready';

/**
 * A combine has no document id to report progress against — it is building a
 * document that does not exist yet — so main reports it under this id and the
 * panel watches for it alongside the active document.
 */
export const COMBINE_PROGRESS_ID = 'combine';

let watching = false;

function openAnnounced(event: ProgressEvent): void {
  if (event.phase !== NEW_DOCUMENT_PHASE) return;
  void window.librarius.file
    .read(event.docId)
    .then((session) => useAppStore.getState().openSession(session))
    .catch(() => {
      useAppStore
        .getState()
        .setError('The new document was created but could not be opened in a tab.');
    });
}

/**
 * Starts listening once per app run. Deliberately never unsubscribed: a combine
 * started from the panel must still open its tab if the user switches tools
 * while it runs.
 */
export function ensureNewDocumentWatcher(): void {
  if (watching) return;
  watching = true;
  window.librarius.onProgress(IPC.ops.progress, openAnnounced);
}

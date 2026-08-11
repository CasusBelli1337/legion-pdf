/**
 * Enabled state for the Undo/Redo controls.
 *
 * It refreshes on the op-completion path rather than on a timer: every
 * operation in the app finishes by swapping the document's session into the
 * store, so a new session object IS "an edit just landed". Watching that object
 * catches stamps, page ops, OCR, save, undo, and redo alike, with one IPC call
 * per completed operation and none while the app sits idle.
 */

import { useEffect, useState } from 'react';
import type { UndoState } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { NO_HISTORY, readUndoState } from '@renderer/app/undo-actions';

/** An answer is only ever shown for the document it was asked about. */
interface Answer {
  docId: string;
  state: UndoState;
}

export function useUndoState(): UndoState {
  const session = useAppStore(
    (state) => state.sessions.find((item) => item.id === state.activeId) ?? null
  );
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (session === null) return;
    const docId = session.id;
    let current = true;
    void readUndoState(docId).then((state) => {
      // The tab can change while the answer is in flight; a stale answer would
      // enable Undo against the wrong document.
      if (current) setAnswer({ docId, state });
    });
    return () => {
      current = false;
    };
  }, [session]);

  // Until this document's own answer is in, both controls stay disabled: an
  // Undo button that offers the previous tab's history is worse than a dim one.
  return answer !== null && answer.docId === session?.id ? answer.state : NO_HISTORY;
}

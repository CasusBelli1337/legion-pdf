/**
 * The panel's view of a redaction run: the run state to draw, the progress
 * stream to feed it, and a way to start one.
 *
 * The run itself is a plain function (apply-redaction.ts) so the save-time gate
 * can await it. Run state lives in the store, not here: applying opens the
 * redacted document in a new tab and makes it active, and a receipt held in this
 * component's state would be discarded at that exact moment.
 */

import { useCallback, useEffect } from 'react';
import type { ProgressEvent } from '@shared/types';
import { applyRedaction } from './apply-redaction';
import type { ApplyRequest } from './apply-redaction';
import { useRedactionStore } from './redaction-store';
import type { RedactionRun } from './redaction-store';

export interface RedactApplyController {
  state: RedactionRun;
  apply(request: ApplyRequest): void;
  reset(): void;
}

/** Progress belongs to the run, not to whichever tab happens to be in front. */
function useProgressStream(): void {
  const noteProgress = useRedactionStore((store) => store.noteProgress);

  useEffect(() => {
    return window.librarius.onProgress('redact:progress', (event: ProgressEvent) => {
      const { run } = useRedactionStore.getState();
      if (event.docId === run.sourceDocId) noteProgress(event);
    });
  }, [noteProgress]);
}

export function useRedactApply(docId: string | null): RedactApplyController {
  const run = useRedactionStore((store) => store.run);
  const resetRun = useRedactionStore((store) => store.resetRun);
  useProgressStream();

  const apply = useCallback(
    (request: ApplyRequest): void => {
      if (docId === null) return;
      void applyRedaction(docId, request);
    },
    [docId]
  );

  return { state: run, apply, reset: resetRun };
}

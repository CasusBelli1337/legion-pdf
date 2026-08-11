/**
 * Running the redaction, and refusing its result if the last gate disagrees.
 *
 * The main process has already proved destruction twice by the time this
 * resolves. The renderer runs one more proof with pdfjs (pdfjs-proof.ts) before
 * the tab is ever shown, because pdfjs is the only reader in the app that maps
 * glyphs back to letters. If that proof fails, the adopted document is thrown
 * away and the attorney gets a loud error — never a receipt.
 *
 * Run state lives in the store, not here: applying opens the redacted document
 * in a new tab and makes it active, and a receipt held in this component's
 * state would be discarded at that exact moment.
 */

import { useCallback, useEffect } from 'react';
import type { ProgressEvent, RedactVerifyResult, RedactionBox } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { failureText, plainError } from './redact-messages';
import { proveWithPdfjs } from './pdfjs-proof';
import { useRedactionStore } from './redaction-store';
import type { RedactionRun } from './redaction-store';
import {
  discardRedactedDocument,
  isRedactedDocumentAnnouncement,
  openRedactedDocument,
} from './redacted-document';

/** 300 DPI is the production default: legible print, and what Tesseract likes. */
export const REDACT_DPI = 300;

export interface ApplyRequest {
  boxes: RedactionBox[];
  verifyStrings: string[];
  reOcr: boolean;
}

export interface RedactApplyController {
  state: RedactionRun;
  apply(request: ApplyRequest): void;
  reset(): void;
}

interface Outcome {
  bytes: Uint8Array;
  receipt: RedactVerifyResult;
}

/** The renderer's own gate. Throws rather than let an unproven tab open. */
async function acceptOrDiscard(
  outcome: Outcome,
  request: ApplyRequest,
  resultDocId: string | null
): Promise<void> {
  const survivors = outcome.receipt.verified
    ? await proveWithPdfjs({
        bytes: outcome.bytes,
        pages: outcome.receipt.pagesRebuilt,
        needles: request.verifyStrings,
        expectNoText: !request.reOcr,
      })
    : outcome.receipt.survivingStrings;

  if (survivors.length === 0) {
    if (resultDocId !== null) await openRedactedDocument(resultDocId);
    return;
  }
  if (resultDocId !== null) await discardRedactedDocument(resultDocId);
  throw new Error(failureText(survivors));
}

/** Progress belongs to the run, not to whichever tab happens to be in front. */
function useProgressStream(): void {
  const noteProgress = useRedactionStore((store) => store.noteProgress);
  const noteResultDocument = useRedactionStore((store) => store.noteResultDocument);

  useEffect(() => {
    return window.librarius.onProgress('redact:progress', (event: ProgressEvent) => {
      if (isRedactedDocumentAnnouncement(event) && event.docId !== null) {
        noteResultDocument(event.docId);
        return;
      }
      const { run } = useRedactionStore.getState();
      if (event.docId === run.sourceDocId) noteProgress(event);
    });
  }, [noteProgress, noteResultDocument]);
}

export function useRedactApply(docId: string | null): RedactApplyController {
  const run = useRedactionStore((store) => store.run);
  const setBusy = useAppStore((store) => store.setBusy);
  const { startRun, finishRun, failRun, resetRun } = useRedactionStore();
  useProgressStream();

  const apply = useCallback(
    (request: ApplyRequest): void => {
      if (docId === null || request.boxes.length === 0) return;
      startRun(docId);
      setBusy('Redacting');
      void window.librarius.redact
        .apply(docId, {
          boxes: request.boxes,
          dpi: REDACT_DPI,
          reOcr: request.reOcr,
          verifyStrings: request.verifyStrings,
        })
        .then(async (result) => {
          const resultDocId = useRedactionStore.getState().run.resultDocId;
          await acceptOrDiscard(
            { bytes: result.bytes, receipt: result.detail },
            request,
            resultDocId
          );
          finishRun(result.detail);
        })
        .catch((error: unknown) => failRun(plainError(error)))
        .finally(() => setBusy(null));
    },
    [docId, failRun, finishRun, setBusy, startRun]
  );

  return { state: run, apply, reset: resetRun };
}

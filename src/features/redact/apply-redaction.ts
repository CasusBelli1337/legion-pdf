/**
 * One redaction run, as a plain async function.
 *
 * It lives outside the hook because there are two callers now: the panel button
 * (fire and forget — the panel watches the run in the store) and the save-time
 * gate, which must AWAIT the result to know the redacted document's id before it
 * can route that document into Save As.
 *
 * The main process has already proved destruction twice by the time this
 * resolves. The renderer runs one more proof with pdfjs (pdfjs-proof.ts) before
 * the tab is ever shown, because pdfjs is the only reader in the app that maps
 * glyphs back to letters. If that proof fails, the adopted document is thrown
 * away and the attorney gets a loud error — never a receipt.
 */

import type { RedactVerifyResult, RedactionBox } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { failureText, plainError } from './redact-messages';
import { isClean, proveWithPdfjs } from './pdfjs-proof';
import { useRedactionStore } from './redaction-store';
import { discardRedactedDocument, openRedactedDocument } from './redacted-document';

/** 300 DPI is the production default: legible print, and what Tesseract likes. */
export const REDACT_DPI = 300;

export interface ApplyRequest {
  boxes: RedactionBox[];
  verifyStrings: string[];
  reOcr: boolean;
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
  const findings = outcome.receipt.verified
    ? await proveWithPdfjs({
        bytes: outcome.bytes,
        pages: outcome.receipt.pagesRebuilt,
        needles: request.verifyStrings,
        expectNoText: !request.reOcr,
      })
    : {
        survivingStrings: outcome.receipt.survivingStrings,
        pagesStillCarryingText: outcome.receipt.pagesStillCarryingText ?? [],
      };

  if (isClean(findings)) {
    if (resultDocId !== null) await openRedactedDocument(resultDocId);
    return;
  }
  if (resultDocId !== null) await discardRedactedDocument(resultDocId);
  throw new Error(failureText(findings.survivingStrings, findings.pagesStillCarryingText));
}

/**
 * Destroys the marked content of `docId` and opens the result in its own tab.
 * Resolves with the REDACTED document's id, or null when nothing was destroyed —
 * a failure is recorded on the run (and shown by the panel), never thrown at a
 * caller who might mistake it for a save that can continue.
 */
export async function applyRedaction(docId: string, request: ApplyRequest): Promise<string | null> {
  if (request.boxes.length === 0) return null;
  useRedactionStore.getState().startRun(docId);
  useAppStore.getState().setBusy('Redacting');
  try {
    const result = await window.librarius.redact.apply(docId, {
      boxes: request.boxes,
      dpi: REDACT_DPI,
      reOcr: request.reOcr,
      verifyStrings: request.verifyStrings,
    });
    // Recorded BEFORE the tab opens: activating the new document resets the
    // panel's document-scoped state, and the run has to be recognised as
    // belonging to it or the receipt would be dropped on the way in.
    const resultDocId = result.detail.docId ?? null;
    if (resultDocId !== null) useRedactionStore.getState().noteResultDocument(resultDocId);
    await acceptOrDiscard({ bytes: result.bytes, receipt: result.detail }, request, resultDocId);
    useRedactionStore.getState().finishRun(result.detail);
    return resultDocId;
  } catch (error) {
    useRedactionStore.getState().failRun(plainError(error));
    return null;
  } finally {
    useAppStore.getState().setBusy(null);
  }
}

// #seam:redact-new-document
/**
 * Redaction never edits a document in place — it builds a new one. The main
 * process adopts that document into the store, but `RedactVerifyResult` has no
 * field to carry the store id back, so main announces it on `redact:progress`
 * under the phase below and this is the renderer half that opens it.
 *
 * The main-process half is electron/ipc/redact.ts, which carries the same
 * marker and the same phrase — redact.test.ts fails if the two ever drift.
 */

import type { ProgressEvent } from '@shared/types';
import { openNewDocuments } from '../organize/new-documents';

export const REDACTED_DOCUMENT_PHASE = 'Redacted document ready';

/** True when this progress event is main handing over a redacted document. */
export function isRedactedDocumentAnnouncement(event: ProgressEvent): boolean {
  return event.phase === REDACTED_DOCUMENT_PHASE && event.docId !== null;
}

/** Open the redacted document in its own tab and make it the active one. */
export async function openRedactedDocument(docId: string): Promise<void> {
  await openNewDocuments([docId]);
}

/**
 * Throw away a redacted document the renderer refused to accept. It was adopted
 * into the store before the last verification gate ran, so a failure has to
 * take it back out rather than leave an unverified document reachable.
 */
export async function discardRedactedDocument(docId: string): Promise<void> {
  await window.librarius.file.close(docId).catch(() => undefined);
}

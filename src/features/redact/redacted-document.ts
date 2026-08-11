/**
 * Redaction never edits a document in place — it builds a new one. The main
 * process adopts that document into the store and returns its id in the
 * receipt (`RedactVerifyResult.docId`), so opening the tab is a plain read by
 * id: nothing here has to agree with the main process about a phase string.
 */

import { openNewDocuments } from '../organize/new-documents';

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

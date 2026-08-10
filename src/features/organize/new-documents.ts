/**
 * Combine, split, and extract create WHOLE NEW documents. The main process
 * adopts each one into the doc store and returns its id in the op's detail
 * (`MergeDetail.docId`, `SplitDetail.partDocIds`, `ExtractDetail.docId`), so
 * opening the tabs is a plain read per id — nothing here has to agree with the
 * main process about a phase string or a synthetic document id.
 */

import { useAppStore } from '../../app/store';

/**
 * Open every newly created document in its own tab, in the order main created
 * them. A document that cannot be read is a loud failure: the op succeeded, so
 * the attorney must be told the tab is missing rather than left guessing.
 */
export async function openNewDocuments(docIds: readonly string[]): Promise<void> {
  for (const docId of docIds) {
    const session = await window.librarius.file.read(docId).catch((cause: unknown) => {
      throw new Error('The new document was created but could not be opened in a tab.', { cause });
    });
    useAppStore.getState().openSession(session);
  }
}

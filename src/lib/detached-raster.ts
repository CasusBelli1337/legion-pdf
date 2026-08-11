/**
 * Rasters for documents that have no tab.
 *
 * Main asks the renderer for page images by docId, and the renderer normally
 * finds the bytes in the open-tab store. A bulk OCR run has no tab: the file is
 * adopted into the MAIN-process store and never opened on screen, so the lookup
 * comes back empty and every page of the run would fail. This closes that gap by
 * pulling the bytes back over `file:read` and loading a pdfjs document of its
 * own.
 *
 * One document is cached at a time, and that is deliberate: a bulk run walks
 * files strictly one after another, so the cache turns "reparse a 200-page scan
 * for every page" into one parse per file — and never holds more than one
 * document's worth of memory. Moving to the next docId destroys the previous.
 */

import type { PDFDocumentProxy } from './pdfjs';
import { loadDocument } from './pdfjs';

async function fetchDocument(docId: string): Promise<PDFDocumentProxy> {
  const session = await window.librarius.file.read(docId);
  return loadDocument(session.bytes);
}

interface CacheEntry {
  docId: string;
  loading: Promise<PDFDocumentProxy>;
}

/** pdfjs 6 tears the worker down through the loading task, not the proxy. */
async function destroy(entry: CacheEntry | null): Promise<void> {
  if (entry === null) return;
  await entry.loading.then((document) => document.loadingTask.destroy()).catch(() => undefined);
}

export class DetachedDocuments {
  private current: CacheEntry | null = null;
  /** Identifies the newest load, so a slow failure cannot evict a newer entry. */
  private generation = 0;

  /**
   * The pdfjs document for a docId that is open in main but not on screen.
   * The cache slot is claimed BEFORE anything is awaited, so the pages of one
   * file rasterizing at the same time share a single load rather than racing
   * into several.
   */
  open(docId: string): Promise<PDFDocumentProxy> {
    const cached = this.current;
    if (cached !== null && cached.docId === docId) return cached.loading;
    this.generation += 1;
    const loading = this.replace(cached, docId, this.generation);
    this.current = { docId, loading };
    return loading;
  }

  /** Tears down the cached document. Safe to call when there is none. */
  async dispose(): Promise<void> {
    const previous = this.current;
    this.current = null;
    await destroy(previous);
  }

  private async replace(
    previous: CacheEntry | null,
    docId: string,
    generation: number
  ): Promise<PDFDocumentProxy> {
    await destroy(previous);
    try {
      return await fetchDocument(docId);
    } catch (error) {
      // A failed load is never left in the cache to fail every later page.
      if (this.generation === generation) this.current = null;
      throw error;
    }
  }
}

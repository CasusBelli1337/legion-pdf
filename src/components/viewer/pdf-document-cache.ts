/**
 * One pdfjs document per byte array, shared by the page viewer, the thumbnail
 * rail, find, and print. Keyed by the bytes themselves, so an op that swaps a
 * document's bytes produces a genuinely new document while any component still
 * holding the old one keeps working until it lets go.
 *
 * THE REFERENCE IS HANDED FORWARD, NEVER DROPPED FIRST. A hook whose bytes
 * change keeps its hold on the outgoing document until the replacement has
 * finished loading. Releasing on the way out is what left the viewer stuck on
 * "Rendering page 1": React runs the cache hook's cleanup in the commit that
 * swaps the bytes, but `usePageRender` still has the OLD document in its
 * dependencies, so its in-flight render is neither cancelled nor re-run. When
 * that release was the last one the document was destroyed underneath a page
 * that was still drawing, pdfjs rejected the render with
 * `RenderingCancelledException`, the page read that as a routine teardown, and
 * nothing ever retried. Holding on until the replacement is ready means the
 * document a mounted page is drawing from is always one somebody still holds.
 *
 * The same rule is what makes an edit flickerless: the previous generation of
 * a document stays available while the new bytes load, so the page run is never
 * unmounted and the page never blanks (see `documentKey` below).
 */

import { useEffect, useRef, useState } from 'react';
import { loadDocument } from '../../lib/pdfjs';
import type { PDFDocumentProxy } from '../../lib/pdfjs';

interface CacheEntry {
  refs: number;
  document: Promise<PDFDocumentProxy>;
}

const entries = new Map<Uint8Array, CacheEntry>();

async function destroy(entry: CacheEntry): Promise<void> {
  try {
    const document = await entry.document;
    // pdfjs 6 tears the worker down through the loading task, not the proxy.
    await document.loadingTask.destroy();
  } catch {
    // A document that never loaded has nothing to tear down.
  }
}

export function acquireDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const existing = entries.get(bytes);
  if (existing !== undefined) {
    existing.refs += 1;
    return existing.document;
  }
  const entry: CacheEntry = { refs: 1, document: loadDocument(bytes) };
  entries.set(bytes, entry);
  return entry.document;
}

export function releaseDocument(bytes: Uint8Array): void {
  const entry = entries.get(bytes);
  if (entry === undefined) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  entries.delete(bytes);
  void destroy(entry);
}

export interface PdfDocumentState {
  /**
   * The document to draw from. While new bytes load this is still the previous
   * generation of the SAME document, so callers keep drawing rather than
   * blanking; `isLoading && document !== null` is exactly that window.
   */
  document: PDFDocumentProxy | null;
  /** Plain English, for the attorney — never a stack trace. */
  error: string | null;
  isLoading: boolean;
}

interface LoadedFor {
  /** The document this generation belongs to; null when the caller gave no key. */
  key: string | null;
  bytes: Uint8Array | null;
  document: PDFDocumentProxy | null;
  error: string | null;
}

const NOTHING_LOADED: LoadedFor = { key: null, bytes: null, document: null, error: null };

/** Every generation this hook is still holding, so none can leak on unmount. */
type Holdings = Map<Uint8Array, Promise<PDFDocumentProxy>>;

function releaseExcept(held: Holdings, keep: Uint8Array | null): void {
  for (const bytes of [...held.keys()]) {
    if (bytes === keep) continue;
    held.delete(bytes);
    releaseDocument(bytes);
  }
}

function describe(
  loaded: LoadedFor,
  bytes: Uint8Array | null,
  key: string | null
): PdfDocumentState {
  const isExact = bytes !== null && loaded.bytes === bytes;
  // Same document, older bytes: keep it on screen rather than blanking the page
  // an edit has just changed. Only ever within one document — a tab switch
  // passes a different key and gets nothing until its own bytes have loaded.
  const isPrevious =
    !isExact && bytes !== null && key !== null && loaded.key === key && loaded.document !== null;
  return {
    document: isExact || isPrevious ? loaded.document : null,
    error: isExact ? loaded.error : null,
    isLoading: bytes !== null && !isExact,
  };
}

/**
 * Load (and share) the pdfjs document for a set of bytes. Null bytes = no
 * document. Pass `documentKey` — the tab's document id — to keep the previous
 * generation of THAT document on screen while new bytes load.
 */
export function usePdfDocument(bytes: Uint8Array | null, documentKey?: string): PdfDocumentState {
  const [loaded, setLoaded] = useState<LoadedFor>(NOTHING_LOADED);
  const held = useRef<Holdings>(new Map());
  const key = documentKey ?? null;

  // Unmount is the only place everything is let go at once.
  useEffect(() => {
    const holdings = held.current;
    return () => releaseExcept(holdings, null);
  }, []);

  useEffect(() => {
    const holdings = held.current;
    // No bytes: let everything go. `loaded` is deliberately NOT reset here —
    // `describe` already answers null for null bytes, and every set of bytes
    // that arrives is freshly cloned across the IPC boundary, so a released
    // generation can never come back under the same identity.
    if (bytes === null) {
      releaseExcept(holdings, null);
      return;
    }
    let active = true;
    // One acquire per distinct generation, however often the effect re-runs.
    const document = holdings.get(bytes) ?? acquireDocument(bytes);
    holdings.set(bytes, document);

    const settle = (next: LoadedFor): void => {
      if (!active) return;
      setLoaded(next);
      // The outgoing generation is off screen now, so it can finally go.
      releaseExcept(holdings, bytes);
    };

    document.then(
      (proxy) => settle({ key, bytes, document: proxy, error: null }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        settle({ key, bytes, document: null, error: `This PDF could not be read: ${message}` });
      }
    );

    return () => {
      active = false;
    };
  }, [bytes, key]);

  return describe(loaded, bytes, key);
}

/**
 * One pdfjs document per byte array, shared by the page viewer, the thumbnail
 * rail, find, and print. Keyed by the bytes themselves, so an op that swaps a
 * document's bytes produces a genuinely new document while any component still
 * holding the old one keeps working until it lets go.
 */

import { useEffect, useState } from 'react';
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
  document: PDFDocumentProxy | null;
  /** Plain English, for the attorney — never a stack trace. */
  error: string | null;
  isLoading: boolean;
}

interface LoadedFor {
  bytes: Uint8Array | null;
  document: PDFDocumentProxy | null;
  error: string | null;
}

const NOTHING_LOADED: LoadedFor = { bytes: null, document: null, error: null };

/** Load (and share) the pdfjs document for a set of bytes. Null bytes = no document. */
export function usePdfDocument(bytes: Uint8Array | null): PdfDocumentState {
  const [loaded, setLoaded] = useState<LoadedFor>(NOTHING_LOADED);

  useEffect(() => {
    if (bytes === null) return;
    let cancelled = false;

    acquireDocument(bytes)
      .then((document) => {
        if (!cancelled) setLoaded({ bytes, document, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoaded({ bytes, document: null, error: `This PDF could not be read: ${message}` });
      });

    return () => {
      cancelled = true;
      releaseDocument(bytes);
    };
  }, [bytes]);

  const isCurrent = loaded.bytes === bytes && bytes !== null;
  return {
    document: isCurrent ? loaded.document : null,
    error: isCurrent ? loaded.error : null,
    isLoading: bytes !== null && !isCurrent,
  };
}

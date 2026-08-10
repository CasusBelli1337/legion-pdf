/**
 * The document's bookmarks (its PDF outline). The main process owns the real
 * answer over `ops:bookmarksGet`; until that lane lands the channel rejects, so
 * the rail falls back to reading the outline straight from pdfjs. Either way an
 * outline-less document says so in plain English instead of looking broken.
 */

import { useEffect, useState } from 'react';
import type { BookmarkNode } from '@shared/types';
import type { PDFDocumentProxy } from '../../lib/pdfjs';

type PdfOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>;
type PageRef = Parameters<PDFDocumentProxy['getPageIndex']>[0];

const MAX_DEPTH = 6;

function isPageRef(value: unknown): value is PageRef {
  return typeof value === 'object' && value !== null && 'num' in value && 'gen' in value;
}

async function pageOf(pdf: PDFDocumentProxy, destination: unknown): Promise<number> {
  const resolved =
    typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
  const target = Array.isArray(resolved) ? (resolved[0] as unknown) : null;
  if (!isPageRef(target)) return 1;
  return (await pdf.getPageIndex(target)) + 1;
}

async function toBookmarks(
  pdf: PDFDocumentProxy,
  outline: PdfOutline,
  depth: number
): Promise<BookmarkNode[]> {
  if (depth > MAX_DEPTH) return [];
  const nodes: BookmarkNode[] = [];
  for (const item of outline) {
    nodes.push({
      title: item.title,
      page: await pageOf(pdf, item.dest),
      children: await toBookmarks(pdf, item.items as PdfOutline, depth + 1),
    });
  }
  return nodes;
}

export interface BookmarksState {
  bookmarks: BookmarkNode[];
  isLoading: boolean;
}

interface LoadedFor {
  docId: string | null;
  bookmarks: BookmarkNode[];
}

export function useBookmarks(
  docId: string | null,
  document: PDFDocumentProxy | null
): BookmarksState {
  const [loaded, setLoaded] = useState<LoadedFor>({ docId: null, bookmarks: [] });

  useEffect(() => {
    if (docId === null) return;
    let cancelled = false;

    async function load(): Promise<BookmarkNode[]> {
      if (docId === null) return [];
      try {
        return await window.librarius.ops.bookmarksGet(docId);
      } catch {
        // The ops lane is not wired yet: read the outline in the renderer instead.
        if (document === null) return [];
        // pdfjs answers null (not an empty array) for a document with no outline.
        const outline: PdfOutline | null = await document.getOutline();
        return outline === null ? [] : toBookmarks(document, outline, 0);
      }
    }

    void load()
      .then((bookmarks) => {
        if (!cancelled) setLoaded({ docId, bookmarks });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ docId, bookmarks: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [docId, document]);

  const isCurrent = loaded.docId === docId;
  return { bookmarks: isCurrent ? loaded.bookmarks : [], isLoading: docId !== null && !isCurrent };
}

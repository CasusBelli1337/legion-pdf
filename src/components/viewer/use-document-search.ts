/**
 * ViewerApi.findText, wired to pdfjs. Text content is pulled page by page and
 * cached for the life of the document, so the second search of a long
 * deposition is instant. Progress is reported per page — a 500-page search
 * must show movement, never a frozen bar.
 */

import { useEffect } from 'react';
import type { TextMatch } from '@shared/types';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { findMatchesOnPage, type SearchTextItem } from './text-search';
import type { ViewerController } from './viewer-controller';
import type { SearchProgress } from './viewer-types';

/** pdfjs mixes marked-content markers into the item list; only runs have `str`. */
async function readPageItems(document: PDFDocumentProxy, page: number): Promise<SearchTextItem[]> {
  const content = await document.getPage(page).then((pdfPage) => pdfPage.getTextContent());
  const items: SearchTextItem[] = [];
  for (const item of content.items) {
    if ('str' in item) items.push(item);
  }
  return items;
}

export function useDocumentSearch(
  document: PDFDocumentProxy | null,
  controller: ViewerController
): void {
  useEffect(() => {
    if (document === null) return;
    const cache = new Map<number, SearchTextItem[]>();

    async function search(query: string, onProgress?: SearchProgress): Promise<TextMatch[]> {
      if (document === null || query.trim() === '') return [];
      const matches: TextMatch[] = [];
      let index = 0;
      for (let page = 1; page <= document.numPages; page += 1) {
        let items = cache.get(page);
        if (items === undefined) {
          items = await readPageItems(document, page);
          cache.set(page, items);
        }
        const result = findMatchesOnPage(items, query, page, index);
        matches.push(...result.matches);
        index = result.nextIndex;
        onProgress?.(page, document.numPages);
      }
      return matches;
    }

    return controller.attachSearch(search);
  }, [controller, document]);
}

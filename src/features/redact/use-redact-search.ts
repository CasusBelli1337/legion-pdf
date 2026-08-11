/**
 * Search-based marking: find every instance of a term across the document, then
 * mark them all in one action. The hits come from the viewer's own text search,
 * so what gets marked is exactly what the attorney can see highlighted.
 */

import { useCallback, useState } from 'react';
import type { TextMatch } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
import { plainError } from './redact-messages';

export interface RedactSearch {
  query: string;
  setQuery(query: string): void;
  searching: boolean;
  /** True once a search has run, so "no results" can be told from "not yet". */
  searched: boolean;
  matches: TextMatch[];
  error: string | null;
  run(): void;
  clear(): void;
}

export function useRedactSearch(api: ViewerApi | null): RedactSearch {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<TextMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback((): void => {
    setMatches([]);
    setSearched(false);
    setError(null);
  }, []);

  // Hits belong to the document they were found in. Adjusting during render
  // rather than in an effect keeps the panel from ever painting a stale count.
  const docId = api?.docId ?? null;
  const [lastDocId, setLastDocId] = useState(docId);
  if (lastDocId !== docId) {
    setLastDocId(docId);
    clear();
  }

  const run = useCallback((): void => {
    const term = query.trim();
    if (api === null || term.length === 0 || searching) return;
    setSearching(true);
    setError(null);
    void api
      .findText(term)
      .then((found) => {
        setMatches(found);
        setSearched(true);
      })
      .catch((cause: unknown) => {
        setMatches([]);
        setSearched(true);
        setError(plainError(cause));
      })
      .finally(() => setSearching(false));
  }, [api, query, searching]);

  return { query, setQuery, searching, searched, matches, error, run, clear };
}

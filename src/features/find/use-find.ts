/**
 * Find in document. Runs through ViewerApi.findText, so the hit list, the
 * highlights, and anything the redaction lane later marks all come from one
 * search implementation with one set of coordinates.
 */

import { useCallback, useMemo, useState } from 'react';
import type { TextMatch } from '@shared/types';
import type { ViewerApi } from '../../components/viewer';

export interface FindState {
  query: string;
  setQuery(query: string): void;
  matches: TextMatch[];
  /** Index into `matches`, or -1 when nothing is selected yet. */
  active: number;
  /** Plain-English progress while a long document is searched. */
  progress: string | null;
  hasSearched: boolean;
  search(): void;
  step(direction: 1 | -1): void;
  goTo(index: number): void;
}

interface Results {
  /** Which document these hits belong to; a tab switch retires them. */
  docId: string | null;
  matches: TextMatch[];
}

export function useFind(api: ViewerApi | null): FindState {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ docId: null, matches: [] });
  const [active, setActive] = useState(-1);
  const [progress, setProgress] = useState<string | null>(null);
  const docId = api?.docId ?? null;
  const isCurrent = results.docId === docId && docId !== null;
  // Memoized so the hit list keeps its identity between renders: `goTo` and
  // `step` close over it, and a fresh [] each render would rebuild them both.
  const matches = useMemo(() => (isCurrent ? results.matches : []), [isCurrent, results.matches]);
  const hasSearched = isCurrent;

  const goTo = useCallback(
    (index: number) => {
      const match = matches[index];
      if (match === undefined || api === null) return;
      setActive(index);
      api.goToPage(match.page);
    },
    [api, matches]
  );

  const search = useCallback(() => {
    if (api === null || query.trim() === '') return;
    setProgress('Searching page 1');
    void api
      .findText(query, (page, total) => setProgress(`Searching page ${page} of ${total}`))
      .then((found) => {
        setResults({ docId: api.docId, matches: found });
        setProgress(null);
        setActive(found.length > 0 ? 0 : -1);
        if (found[0] !== undefined) api.goToPage(found[0].page);
      })
      .catch(() => {
        setResults({ docId: api.docId, matches: [] });
        setProgress(null);
      });
  }, [api, query]);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return;
      const next = (active + direction + matches.length) % matches.length;
      goTo(next);
    },
    [active, goTo, matches.length]
  );

  return { query, setQuery, matches, active, progress, hasSearched, search, step, goTo };
}

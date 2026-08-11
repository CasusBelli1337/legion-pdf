/**
 * Ctrl+F. A strip under the toolbar (it pushes the pages down, never covers
 * them) with the hit list, next/previous, and live progress while a long
 * document is searched.
 */

import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useViewerApi } from '../../components/viewer';
import { useFind, type FindState } from './use-find';
import { useFindHighlights } from './find-highlights';
import { FindResults } from './find-results';

const ICON_BUTTON =
  'flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors ' +
  'duration-150 hover:bg-armory-interactive hover:text-text-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

function statusOf(find: FindState): string {
  if (find.progress !== null) return find.progress;
  if (find.matches.length > 0) return `${find.active + 1} of ${find.matches.length}`;
  return find.hasSearched ? 'No matches' : 'Press Enter to search';
}

function FindControls({ find, onClose }: { find: FindState; onClose(): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div className="flex h-9 items-center gap-2 px-3">
      <input
        ref={inputRef}
        value={find.query}
        onChange={(event) => find.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') find.search();
          if (event.key === 'Escape') onClose();
        }}
        placeholder="Find in document"
        aria-label="Find in document"
        className="h-6 w-64 rounded border border-armory-border bg-armory-base px-2 text-xs text-text-primary focus:border-armory-focus focus:outline-none"
      />
      {find.progress !== null && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
      )}
      <span className="readout text-text-muted">{statusOf(find)}</span>
      <button
        type="button"
        className={ICON_BUTTON}
        onClick={() => find.step(-1)}
        disabled={find.matches.length === 0}
        aria-label="Previous match"
      >
        <ChevronUp size={13} aria-hidden />
      </button>
      <button
        type="button"
        className={ICON_BUTTON}
        onClick={() => find.step(1)}
        disabled={find.matches.length === 0}
        aria-label="Next match"
      >
        <ChevronDown size={13} aria-hidden />
      </button>
      <button
        type="button"
        className={`${ICON_BUTTON} ml-auto`}
        onClick={onClose}
        aria-label="Close find"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}

export function FindBar({ onClose }: { onClose(): void }) {
  const api = useViewerApi();
  const find = useFind(api);
  useFindHighlights(api, find.matches, find.active);

  return (
    <div className="flex shrink-0 flex-col border-b border-armory-border bg-armory-elevated">
      <FindControls find={find} onClose={onClose} />
      <FindResults matches={find.matches} active={find.active} onSelect={find.goTo} />
    </div>
  );
}

/**
 * The hit list. Collapsed to a short scrolling strip so a search with 400 hits
 * never pushes the document off the screen.
 */

import type { TextMatch } from '@shared/types';

interface FindResultsProps {
  matches: readonly TextMatch[];
  active: number;
  onSelect(index: number): void;
}

export function FindResults({ matches, active, onSelect }: FindResultsProps) {
  if (matches.length === 0) return null;

  return (
    <ul className="max-h-32 overflow-y-auto border-t border-armory-border">
      {matches.map((match, index) => (
        <li key={`${match.page}-${match.index}`}>
          <button
            type="button"
            onClick={() => onSelect(index)}
            className={`flex w-full items-baseline gap-2 px-3 py-1 text-left text-xs transition-colors duration-150 hover:bg-armory-interactive ${
              index === active ? 'bg-armory-interactive text-text-primary' : 'text-text-secondary'
            }`}
          >
            <span className="readout shrink-0 text-text-muted">Page {match.page}</span>
            <span className="min-w-0 flex-1 truncate">{match.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

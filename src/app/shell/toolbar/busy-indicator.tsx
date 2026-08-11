/**
 * What the app is doing right now, on the toolbar where the work is happening.
 * A pulse plus the store's own message ("Opening 2 of 3", "Saving") — the UI
 * golden rule is that something visibly moves whenever the app is busy.
 */

import { useAppStore } from '../../store';

export function BusyIndicator() {
  const busy = useAppStore((state) => state.busy);
  if (busy === null) return null;

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
      <span className="readout text-text-secondary">{busy}</span>
    </span>
  );
}

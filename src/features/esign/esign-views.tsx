/**
 * Small shared controls for the E-Sign panel, on top of the stamps lane's form
 * kit (Section, TextField, ActionButton and friends come from there — one
 * source of truth for panel styling).
 */

import { Trash2 } from 'lucide-react';

/** The stamps lane's input styling, for the raw inputs this panel needs. */
export const INPUT_CLASS =
  'rounded-md border border-armory-border bg-armory-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-armory-focus';

export function TrashButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1 text-text-muted transition-colors duration-150 hover:bg-armory-interactive hover:text-danger"
    >
      <Trash2 size={12} aria-hidden />
    </button>
  );
}

interface BusyButtonProps {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onClick(): void;
}

/** The primary action button, with movement while its work is in flight. */
export function BusyButton({ label, busyLabel, busy, disabled, onClick }: BusyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled === true}
      className="flex items-center justify-center gap-2 rounded-md bg-brand-700 px-3 py-2 text-xs font-medium text-text-on-brand transition-colors duration-150 hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-armory-interactive disabled:text-text-muted"
    >
      {busy && (
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500" aria-hidden />
      )}
      {busy ? busyLabel : label}
    </button>
  );
}

/**
 * The two presentational pieces of the selection menu, kept apart from the menu
 * itself so the menu is only wiring: what the row looks like, and what "still
 * working" looks like.
 *
 * The pending row exists because a right-click on a long selection has to
 * classify pages before it can say anything — a pulse and four words is the
 * difference between "thinking" and "broken".
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const ROW =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-text-primary ' +
  'transition-colors duration-150 hover:bg-armory-interactive ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

export interface MenuRowProps {
  icon: LucideIcon;
  label: string;
  /** The cite preview, or a warning like "check cite". */
  hint?: string;
  disabled: boolean;
  onSelect: () => void;
  /** Trailing control, e.g. the pencil that edits the cite prefix. */
  children?: ReactNode;
}

export function MenuRow({ icon: Icon, label, hint, disabled, onSelect, children }: MenuRowProps) {
  return (
    <div className="flex items-center">
      <button type="button" className={ROW} disabled={disabled} onClick={onSelect}>
        <Icon size={13} aria-hidden className="shrink-0 text-text-muted" />
        <span className="grow">{label}</span>
        {hint !== undefined && <span className="readout truncate text-text-muted">{hint}</span>}
      </button>
      {children}
    </div>
  );
}

export function PendingRow() {
  return (
    <span className="flex items-center gap-2 px-2 py-1.5 text-xs text-text-muted">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
      Reading selection…
    </span>
  );
}

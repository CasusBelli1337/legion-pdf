/**
 * Window chrome. 56px, bg-surface, purple mono wordmark per the Armory nav spec.
 */

import { FolderOpen, Printer, Save } from 'lucide-react';
import { useActiveSession, useAppStore } from '../store';

interface TopBarProps {
  onOpen(): void;
  onSave(): void;
  onPrint(): void;
}

const ACTION_CLASS =
  'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-text-secondary ' +
  'transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent';

export function TopBar({ onOpen, onSave, onPrint }: TopBarProps) {
  const session = useActiveSession();
  const busy = useAppStore((state) => state.busy);
  const hasDocument = session !== null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-armory-border bg-armory-surface px-4">
      <span className="font-mono text-sm font-bold tracking-[0.1em] text-purple-400 uppercase">
        Legion Armory - Librarius
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className={ACTION_CLASS} onClick={onOpen}>
          <FolderOpen size={14} aria-hidden />
          Open
        </button>
        <button type="button" className={ACTION_CLASS} onClick={onSave} disabled={!hasDocument}>
          <Save size={14} aria-hidden />
          Save
        </button>
        <button type="button" className={ACTION_CLASS} onClick={onPrint} disabled={!hasDocument}>
          <Printer size={14} aria-hidden />
          Print
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {busy !== null && (
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
            <span className="readout text-text-secondary">{busy}</span>
          </>
        )}
      </div>
    </header>
  );
}

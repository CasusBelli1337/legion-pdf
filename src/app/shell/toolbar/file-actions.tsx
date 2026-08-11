/**
 * Open, Save, Save a copy, Print — the File menu, on the toolbar.
 *
 * The native menu BAR is hidden (electron/main.ts), so these buttons are the
 * only place an attorney can see these actions. The accelerators still fire
 * through the application menu, and every tooltip names its shortcut so the
 * two never drift apart in the user's head.
 */

import { FolderOpen, Printer, Save, SaveAll } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { openDialog, printActive, saveActive, saveActiveAs } from '../../document-actions';
import { useActiveSession } from '../../store';
import { TOOLBAR_BUTTON } from './toolbar-classes';

interface FileAction {
  label: string;
  shortcut: string;
  icon: LucideIcon;
  run(): void;
  /** False for Open: it is the one action that works with nothing loaded. */
  needsDocument: boolean;
}

const ACTIONS: readonly FileAction[] = [
  {
    label: 'Open',
    shortcut: 'Ctrl+O',
    icon: FolderOpen,
    run: () => void openDialog(),
    needsDocument: false,
  },
  {
    label: 'Save',
    shortcut: 'Ctrl+S',
    icon: Save,
    run: () => void saveActive(),
    needsDocument: true,
  },
  {
    label: 'Save a copy',
    shortcut: 'Ctrl+Shift+S',
    icon: SaveAll,
    run: () => void saveActiveAs(),
    needsDocument: true,
  },
  {
    label: 'Print',
    shortcut: 'Ctrl+P',
    icon: Printer,
    run: () => void printActive(),
    needsDocument: true,
  },
];

export function FileActions() {
  const hasDocument = useActiveSession() !== null;

  return (
    <>
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            type="button"
            className={TOOLBAR_BUTTON}
            onClick={action.run}
            disabled={action.needsDocument && !hasDocument}
            aria-label={action.label}
            title={`${action.label} (${action.shortcut})`}
          >
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
    </>
  );
}

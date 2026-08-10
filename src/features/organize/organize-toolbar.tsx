/**
 * The panel's buttons, rendered from a list of actions rather than hard-wired
 * markup — a new page operation is a new entry in the panel's action array.
 */

import type { LucideIcon } from 'lucide-react';

export interface PanelAction {
  id: string;
  /** Plain-English verb the attorney reads, e.g. "Move to new file". */
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  /** Red styling: this one throws pages away. */
  danger?: boolean;
  run(): void;
}

interface OrganizeToolbarProps {
  title: string;
  actions: readonly PanelAction[];
}

export function OrganizeToolbar({ title, actions }: OrganizeToolbarProps) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-armory-border p-3">
      <span className="readout text-text-muted">{title}</span>
      <div className="grid grid-cols-2 gap-1.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={action.run}
              className={`flex items-center gap-1.5 rounded-md border border-armory-border bg-armory-elevated px-2 py-1.5 text-left text-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                action.danger === true
                  ? 'text-text-secondary hover:border-danger hover:text-danger'
                  : 'text-text-secondary hover:border-armory-border-strong hover:text-text-primary'
              }`}
            >
              <Icon size={13} aria-hidden className="shrink-0" />
              <span className="truncate">{action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The two rows that come with tool use: the switch that arms it, and the
 * examples that tell the attorney what to ask for. Both are plain English —
 * "Centurion can act on this document", not "function calling".
 */

import { Wrench } from 'lucide-react';
import { QUICK_ACTIONS } from './tool-copy';

export function ToolsToggle(props: { enabled: boolean; onChange(enabled: boolean): void }) {
  return (
    <label className="flex shrink-0 items-center gap-2 border-t border-armory-border px-3 py-2">
      <input
        type="checkbox"
        checked={props.enabled}
        onChange={(event) => props.onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-purple-600"
      />
      <Wrench size={12} className="text-text-muted" aria-hidden />
      <span className="text-xs text-text-secondary">
        Centurion can act on this document
        <span className="text-text-muted"> - it asks first, every time.</span>
      </span>
    </label>
  );
}

export function QuickActions(props: { disabled: boolean; onPick(question: string): void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pt-2">
      <span className="readout text-text-muted">Try</span>
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          disabled={props.disabled}
          onClick={() => props.onPick(action)}
          className="rounded-md border border-armory-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-muted"
        >
          {action}
        </button>
      ))}
    </div>
  );
}

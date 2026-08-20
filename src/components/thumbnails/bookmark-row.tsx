/**
 * One line of the bookmark rail, in whichever of its three states applies:
 * the heading itself, the box for renaming it, or the confirmation before it is
 * removed. The controls are always visible rather than hover-only — a hidden
 * control is one an attorney never finds.
 */

import { Pencil, Trash2 } from 'lucide-react';
import type { BookmarkNode } from '@shared/types';
import type { BookmarkDraft, BookmarkPath } from './bookmark-edits';

const ICON_BUTTON =
  'shrink-0 rounded p-1 text-text-muted transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-muted';

const SMALL_BUTTON = 'rounded px-2 py-0.5 text-xs transition-colors duration-150';

export interface BookmarkRowActions {
  disabled: boolean;
  onSelect(page: number): void;
  onDraft(draft: BookmarkDraft): void;
  onRename(path: BookmarkPath, title: string): void;
  onRemove(path: BookmarkPath): void;
}

interface InlineEditProps {
  value: string;
  label: string;
  confirmLabel: string;
  disabled: boolean;
  onChange(value: string): void;
  onConfirm(): void;
  onCancel(): void;
}

/** The one text box used for both renaming and adding: Enter saves, Escape backs out. */
export function InlineEdit(props: InlineEditProps) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <input
        autoFocus
        type="text"
        value={props.value}
        aria-label={props.label}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') props.onConfirm();
          if (event.key === 'Escape') props.onCancel();
        }}
        className="w-full rounded border border-armory-border bg-armory-base px-1.5 py-1 text-xs text-text-primary focus:border-brand-600 focus:outline-none"
      />
      <div className="flex gap-1">
        <button
          type="button"
          disabled={props.disabled || props.value.trim().length === 0}
          onClick={props.onConfirm}
          className={`${SMALL_BUTTON} bg-brand-700 text-text-on-brand hover:bg-brand-600 disabled:bg-armory-interactive disabled:text-text-muted`}
        >
          {props.confirmLabel}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className={`${SMALL_BUTTON} text-text-secondary hover:bg-armory-interactive hover:text-text-primary`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RemoveConfirm({
  node,
  path,
  actions,
}: {
  node: BookmarkNode;
  path: BookmarkPath;
  actions: BookmarkRowActions;
}) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <span className="truncate text-xs text-text-secondary">Remove "{node.title}"?</span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={actions.disabled}
          onClick={() => actions.onRemove(path)}
          className={`${SMALL_BUTTON} bg-danger text-text-on-danger hover:brightness-110 disabled:bg-armory-interactive disabled:text-text-muted`}
        >
          Remove
        </button>
        <button
          type="button"
          onClick={() => actions.onDraft({ kind: 'idle' })}
          className={`${SMALL_BUTTON} text-text-secondary hover:bg-armory-interactive hover:text-text-primary`}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

interface BookmarkRowProps {
  node: BookmarkNode;
  depth: number;
  path: BookmarkPath;
  draft: BookmarkDraft;
  actions: BookmarkRowActions;
}

export function BookmarkRow({ node, depth, path, draft, actions }: BookmarkRowProps) {
  const indent = { paddingLeft: `${8 + depth * 12}px` };

  if (draft.kind === 'remove') return <RemoveConfirm node={node} path={path} actions={actions} />;

  if (draft.kind === 'rename') {
    return (
      <div style={indent}>
        <InlineEdit
          value={draft.title}
          label={`New name for ${node.title}`}
          confirmLabel="Save"
          disabled={actions.disabled}
          onChange={(title) => actions.onDraft({ kind: 'rename', path, title })}
          onConfirm={() => actions.onRename(path, draft.title)}
          onCancel={() => actions.onDraft({ kind: 'idle' })}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 pr-1" style={indent}>
      <button
        type="button"
        onClick={() => actions.onSelect(node.page)}
        title={`${node.title} - page ${node.page}`}
        className="flex min-w-0 flex-1 items-baseline gap-2 py-1 text-left text-xs text-text-secondary transition-colors duration-150 hover:text-text-primary"
      >
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        <span className="readout shrink-0 text-text-muted">{node.page}</span>
      </button>
      <button
        type="button"
        aria-label={`Rename ${node.title}`}
        disabled={actions.disabled}
        onClick={() => actions.onDraft({ kind: 'rename', path, title: node.title })}
        className={ICON_BUTTON}
      >
        <Pencil className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Delete ${node.title}`}
        disabled={actions.disabled}
        onClick={() => actions.onDraft({ kind: 'remove', path })}
        className={ICON_BUTTON}
      >
        <Trash2 className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

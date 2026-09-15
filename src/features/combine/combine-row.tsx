/**
 * One file in the combine list. Drag the row to reorder it, or use the arrows —
 * the arrows are there because a drag is hard to aim at with a trackpad, and an
 * exhibit set in the wrong order is a filing problem.
 */

import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import type { CombineEntry } from './combine-list';

const SMALL_BUTTON =
  'rounded p-1 text-text-muted transition-colors duration-150 hover:bg-armory-interactive';

interface CombineRowProps {
  entry: CombineEntry;
  position: number;
  /** True while a dragged row would land immediately above this one. */
  dropTarget: boolean;
  dragging: boolean;
  onDragStart(): void;
  onDragOver(): void;
  onDrop(): void;
  onDragEnd(): void;
  onNudge(direction: -1 | 1): void;
  onRemove(): void;
}

export function CombineRow({ entry, position, dropTarget, dragging, ...on }: CombineRowProps) {
  return (
    <li
      draggable
      data-combine-row={entry.label}
      onDragStart={on.onDragStart}
      onDragEnd={on.onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        on.onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        on.onDrop();
      }}
      className={`flex items-center gap-1.5 rounded-md border bg-armory-elevated px-2 py-1.5 ${
        dragging ? 'border-brand-500 opacity-60' : 'border-armory-border'
      } ${dropTarget ? 'border-t-2 border-t-brand-400' : ''}`}
    >
      <GripVertical size={12} aria-hidden className="shrink-0 cursor-grab text-text-muted" />
      <span className="readout w-5 shrink-0 text-text-muted">{position}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs text-text-primary" title={entry.label}>
          {entry.label}
        </span>
        <span className="readout text-text-muted">
          {entry.kind}
          {entry.pageCount !== null &&
            ` - ${entry.pageCount} ${entry.pageCount === 1 ? 'page' : 'pages'}`}
        </span>
      </span>
      <RowButtons label={entry.label} onNudge={on.onNudge} onRemove={on.onRemove} />
    </li>
  );
}

interface RowButtonsProps {
  label: string;
  onNudge(direction: -1 | 1): void;
  onRemove(): void;
}

function RowButtons({ label, onNudge, onRemove }: RowButtonsProps) {
  return (
    <>
      <button
        type="button"
        aria-label={`Move up: ${label}`}
        onClick={() => onNudge(-1)}
        className={`${SMALL_BUTTON} hover:text-text-primary`}
      >
        <ArrowUp size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Move down: ${label}`}
        onClick={() => onNudge(1)}
        className={`${SMALL_BUTTON} hover:text-text-primary`}
      >
        <ArrowDown size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className={`${SMALL_BUTTON} hover:text-danger`}
      >
        <X size={12} aria-hidden />
      </button>
    </>
  );
}

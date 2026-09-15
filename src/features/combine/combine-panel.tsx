/**
 * Combine Files — Acrobat's flow, in the dock. A list of the files that will
 * become one PDF, top to bottom, with the order under the attorney's thumb
 * (drag a row, or use the arrows). Nothing on disk is changed: the result opens
 * as a new unsaved tab and the receipt says exactly what it contains.
 *
 * The list lives in `combine-store.ts` rather than in this component, because
 * Explorer's "Combine in Legion PDF" fills it before this panel is on screen.
 */

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { addFilesFromDialog, addOpenDocuments, runCombine, saveCombined } from './combine-actions';
import type { CombineEntry } from './combine-list';
import { CombineRow } from './combine-row';
import { CombineStatus } from './combine-status';
import { useCombineStore } from './combine-store';

const OUTLINE_BUTTON =
  'rounded-md border border-armory-border px-3 py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:border-armory-border-strong hover:text-text-primary';

/** Which row is being dragged, and which row it would land in front of. */
interface DragState {
  from: number | null;
  before: number | null;
}

const NO_DRAG: DragState = { from: null, before: null };

function EmptyList() {
  return (
    <p className="rounded-md border border-dashed border-armory-border p-3 text-xs leading-relaxed text-text-muted">
      No files yet. Add them below - or select several files in Windows Explorer, right-click, and
      choose Combine in Legion PDF.
    </p>
  );
}

interface PendingListProps {
  entries: readonly CombineEntry[];
  drag: DragState;
  onDrag(next: DragState): void;
  onDrop(beforeIndex: number): void;
}

function PendingList({ entries, drag, onDrag, onDrop }: PendingListProps) {
  if (entries.length === 0) return <EmptyList />;
  const store = useCombineStore.getState;

  return (
    <ol className="flex flex-col gap-1">
      {entries.map((entry, index) => (
        <CombineRow
          key={entry.key}
          entry={entry}
          position={index + 1}
          dragging={drag.from === index}
          dropTarget={drag.before === index}
          onDragStart={() => onDrag({ from: index, before: null })}
          onDragEnd={() => onDrag(NO_DRAG)}
          onDragOver={() => onDrag({ from: drag.from, before: index })}
          onDrop={() => onDrop(index)}
          onNudge={(direction) => store().nudge(index, direction)}
          onRemove={() => store().remove(entry.key)}
        />
      ))}
      {/* The tail drop zone: without it the last position is unreachable. */}
      <li
        aria-hidden
        onDragOver={(event) => {
          event.preventDefault();
          onDrag({ from: drag.from, before: entries.length });
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(entries.length);
        }}
        className={`h-3 rounded ${drag.before === entries.length ? 'bg-brand-400' : ''}`}
      />
    </ol>
  );
}

interface ControlsProps {
  count: number;
  busy: boolean;
  onCombine(): void;
  onClear(): void;
}

function Controls({ count, busy, onCombine, onClear }: ControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void addFilesFromDialog()}
          className={`${OUTLINE_BUTTON} flex-1`}
        >
          Add files...
        </button>
        <button type="button" onClick={addOpenDocuments} className={`${OUTLINE_BUTTON} flex-1`}>
          Add open documents
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || count < 2}
          onClick={onCombine}
          className="flex-1 rounded-md bg-brand-700 px-3 py-1.5 text-xs font-medium text-text-on-brand transition-colors duration-150 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {count < 2 ? 'Combine files' : `Combine ${count} files`}
        </button>
        {count > 0 && (
          <button type="button" onClick={onClear} className={OUTLINE_BUTTON}>
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

export function CombinePanel() {
  const { entries, busy, progress, receipt, notice, error } = useCombineStore(
    useShallow((state) => ({
      entries: state.entries,
      busy: state.busy,
      progress: state.progress,
      receipt: state.receipt,
      notice: state.notice,
      error: state.error,
    }))
  );
  const [drag, setDrag] = useState<DragState>(NO_DRAG);

  const drop = (beforeIndex: number): void => {
    if (drag.from !== null) useCombineStore.getState().dropBefore(drag.from, beforeIndex);
    setDrag(NO_DRAG);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs leading-relaxed text-text-secondary">
          Files are combined top to bottom into one new PDF. Word documents and images are turned
          into PDF pages on the way in. Nothing here is changed on disk.
        </p>
        <PendingList entries={entries} drag={drag} onDrag={setDrag} onDrop={drop} />
        <Controls
          count={entries.length}
          busy={busy !== null}
          onCombine={() => void runCombine()}
          onClear={() => useCombineStore.getState().clear()}
        />
      </div>

      <CombineStatus
        busy={busy}
        progress={progress}
        receipt={receipt}
        notice={notice}
        error={error}
        onSave={(docId) => void saveCombined(docId)}
        onDismiss={() => useCombineStore.getState().dismiss()}
      />
    </div>
  );
}

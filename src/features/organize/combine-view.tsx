/**
 * Combine view. The open document starts the list; add files with the picker,
 * reorder with Up and Down so the order is unambiguous, then merge into a new
 * tab. Each file's bookmarks are kept under its own name.
 */

import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { DocumentSession, MergeSource } from '@shared/types';

interface CombineEntry {
  key: string;
  label: string;
  source: MergeSource;
}

function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function move(entries: CombineEntry[], index: number, direction: -1 | 1): CombineEntry[] {
  const target = index + direction;
  if (target < 0 || target >= entries.length) return entries;
  const next = [...entries];
  const [moved] = next.splice(index, 1);
  if (moved !== undefined) next.splice(target, 0, moved);
  return next;
}

const SMALL_BUTTON =
  'rounded p-1 text-text-muted transition-colors duration-150 hover:bg-armory-interactive';
const OUTLINE_BUTTON =
  'rounded-md border border-armory-border px-3 py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:border-armory-border-strong hover:text-text-primary';

interface EntryRowProps {
  entry: CombineEntry;
  position: number;
  onMove(direction: -1 | 1): void;
  onRemove(): void;
}

function EntryRow({ entry, position, onMove, onRemove }: EntryRowProps) {
  return (
    <li className="flex items-center gap-1 rounded-md border border-armory-border bg-armory-elevated px-2 py-1">
      <span className="readout w-5 shrink-0 text-text-muted">{position}</span>
      <span className="flex-1 truncate text-xs text-text-primary" title={entry.label}>
        {entry.label}
      </span>
      <button
        type="button"
        aria-label={`Move up: ${entry.label}`}
        onClick={() => onMove(-1)}
        className={`${SMALL_BUTTON} hover:text-text-primary`}
      >
        <ArrowUp size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Move down: ${entry.label}`}
        onClick={() => onMove(1)}
        className={`${SMALL_BUTTON} hover:text-text-primary`}
      >
        <ArrowDown size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Remove ${entry.label}`}
        onClick={onRemove}
        className={`${SMALL_BUTTON} hover:text-danger`}
      >
        <X size={12} aria-hidden />
      </button>
    </li>
  );
}

interface CombineViewProps {
  session: DocumentSession;
  busy: boolean;
  onCancel(): void;
  onCombine(sources: MergeSource[]): void;
}

export function CombineView({ session, busy, onCancel, onCombine }: CombineViewProps) {
  const [entries, setEntries] = useState<CombineEntry[]>([
    { key: session.id, label: session.fileName, source: { docId: session.id } },
  ]);

  const addFiles = async (): Promise<void> => {
    const paths = await window.librarius.file.openDialog();
    setEntries((current) => [
      ...current,
      ...paths.map((filePath, index) => ({
        key: `${filePath}:${current.length + index}`,
        label: baseName(filePath),
        source: { filePath },
      })),
    ]);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-text-secondary">
        Files are combined top to bottom into a new document. Nothing here is changed on disk.
      </p>

      <ol className="flex flex-col gap-1">
        {entries.map((entry, index) => (
          <EntryRow
            key={entry.key}
            entry={entry}
            position={index + 1}
            onMove={(direction) => setEntries((current) => move(current, index, direction))}
            onRemove={() => setEntries((current) => current.filter((item) => item !== entry))}
          />
        ))}
      </ol>

      <CombineControls
        count={entries.length}
        busy={busy}
        onAdd={() => void addFiles()}
        onCombine={() => onCombine(entries.map((entry) => entry.source))}
        onCancel={onCancel}
      />
    </div>
  );
}

interface CombineControlsProps {
  count: number;
  busy: boolean;
  onAdd(): void;
  onCombine(): void;
  onCancel(): void;
}

function CombineControls({ count, busy, onAdd, onCombine, onCancel }: CombineControlsProps) {
  return (
    <>
      <button type="button" onClick={onAdd} className={OUTLINE_BUTTON}>
        Add PDF files...
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || count < 2}
          onClick={onCombine}
          className="flex-1 rounded-md bg-purple-700 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-150 hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Combine {count} files
        </button>
        <button type="button" onClick={onCancel} className={OUTLINE_BUTTON}>
          Cancel
        </button>
      </div>
    </>
  );
}

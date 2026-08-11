/**
 * The one dialog that stands between a live signature and a signed file.
 *
 * It says what will happen in the attorney's own words — permanent, cannot be
 * undone — because after this the signature is page content, exactly like the
 * text around it. It then STAYS on screen and turns into a progress readout
 * while the signatures are written, so a document with a dozen of them never
 * looks frozen (UI golden rule: show movement).
 */

import { useEffect, useRef } from 'react';
import {
  FLATTEN_CANCEL_NOTE,
  FLATTEN_CONFIRM_LABEL,
  flattenHeading,
  flattenQuestion,
  PROGRESS_THRESHOLD,
} from './flatten-copy';

export interface FlattenProgress {
  current: number;
  total: number;
}

export interface FlattenConfirmProps {
  count: number;
  progress: FlattenProgress | null;
  onConfirm(): void;
  onCancel(): void;
}

function Placing({ progress }: { progress: FlattenProgress }) {
  const percent = Math.round((progress.current / Math.max(1, progress.total)) * 100);
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="text-sm text-text-primary">Placing your signatures into the document.</p>
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500" />
          Writing them into the page
        </span>
        <span className="readout text-text-secondary">
          Signature {progress.current} of {progress.total}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-armory-interactive"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}

function Question({ count, onConfirm, onCancel }: Omit<FlattenConfirmProps, 'progress'>) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmButton.current?.focus(), []);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-text-primary">{flattenHeading(count)}</h2>
      <p className="text-xs leading-relaxed text-warning">{flattenQuestion(count)}</p>
      <p className="text-xs leading-relaxed text-text-secondary">{FLATTEN_CANCEL_NOTE}</p>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-armory-border-strong px-3 py-2 text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          ref={confirmButton}
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-brand-700 px-3 py-2 text-xs font-medium text-text-on-brand transition-colors duration-150 hover:bg-brand-600"
        >
          {FLATTEN_CONFIRM_LABEL}
        </button>
      </div>
    </div>
  );
}

export function FlattenConfirm({ count, progress, onConfirm, onCancel }: FlattenConfirmProps) {
  const working = progress !== null && progress.total > PROGRESS_THRESHOLD;

  useEffect(() => {
    if (progress !== null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, progress]);

  if (progress !== null && !working) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-armory-base/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Place signatures into the document"
    >
      <div className="w-full max-w-sm rounded-lg border border-armory-border-strong bg-armory-surface p-4 shadow-glow">
        {working && progress !== null ? (
          <Placing progress={progress} />
        ) : (
          <Question count={count} onConfirm={onConfirm} onCancel={onCancel} />
        )}
      </div>
    </div>
  );
}

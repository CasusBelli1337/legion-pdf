/**
 * The panel's bottom strip: what is running ("Reading pages - page 12 of 65"),
 * what just happened, or what went wrong — in that order, never two at once.
 * The app must always look like it is doing something (UI golden rule 2).
 */

import type { ProgressEvent } from '@shared/types';
import type { CombineReceipt } from './combine-store';

const OUTLINE_BUTTON =
  'rounded-md border border-armory-border px-3 py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:border-armory-border-strong hover:text-text-primary';

interface CombineStatusProps {
  busy: string | null;
  progress: ProgressEvent | null;
  receipt: CombineReceipt | null;
  notice: string | null;
  error: string | null;
  onSave(docId: string): void;
  onDismiss(): void;
}

function progressLine(busy: string, progress: ProgressEvent | null): string {
  if (progress === null || progress.total <= 0) return `${busy}...`;
  return `${progress.phase} - page ${progress.current} of ${progress.total}`;
}

function RunningLine({ busy, progress }: { busy: string; progress: ProgressEvent | null }) {
  const percent =
    progress !== null && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : null;
  return (
    <section className="flex flex-col gap-1.5 border-t border-armory-border p-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        <span className="text-xs text-text-secondary">{progressLine(busy, progress)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-armory-interactive">
        <div
          className="h-full bg-brand-600 transition-all duration-150"
          style={{ width: `${percent ?? 15}%` }}
        />
      </div>
    </section>
  );
}

function ReceiptPanel({ receipt, onSave }: { receipt: CombineReceipt; onSave(id: string): void }) {
  return (
    <section className="flex flex-col gap-2 border-t border-armory-border p-3">
      <p className="text-xs leading-relaxed text-text-secondary">
        {receipt.message} It is open in a new tab and has not been saved yet.
      </p>
      <button type="button" onClick={() => onSave(receipt.docId)} className={OUTLINE_BUTTON}>
        Save As...
      </button>
    </section>
  );
}

export function CombineStatus({
  busy,
  progress,
  receipt,
  notice,
  error,
  ...on
}: CombineStatusProps) {
  if (busy !== null) return <RunningLine busy={busy} progress={progress} />;
  if (receipt !== null) return <ReceiptPanel receipt={receipt} onSave={on.onSave} />;
  if (error === null && notice === null) return null;

  return (
    <section className="flex items-start gap-2 border-t border-armory-border p-3">
      <p
        className={`flex-1 text-xs leading-relaxed ${error === null ? 'text-text-secondary' : 'text-danger'}`}
      >
        {error ?? notice}
      </p>
      <button
        type="button"
        onClick={on.onDismiss}
        aria-label="Dismiss message"
        className="readout text-text-muted transition-colors duration-150 hover:text-text-primary"
      >
        OK
      </button>
    </section>
  );
}

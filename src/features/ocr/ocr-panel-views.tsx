/**
 * The panel's presentational pieces. Armory tokens only — no hardcoded colours,
 * no emojis. Movement is mandatory: while a run is going the pulse, the bar and
 * the page counter all move together (UI golden rules 2 and 7).
 */

import type { OcrRunDetail, ProgressEvent } from '@shared/types';
import { pageLabel, percentComplete, runReceipt } from './ocr-messages';

export function PanelNotice({ children }: { children: string }) {
  return <p className="text-sm leading-relaxed text-text-secondary">{children}</p>;
}

export function StatusLine({ label, tone }: { label: string; tone: 'idle' | 'busy' | 'done' }) {
  const dot = {
    idle: 'bg-text-muted',
    busy: 'animate-pulse bg-brand-500',
    done: 'bg-status-operational',
  }[tone];
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="readout text-text-muted">{label}</span>
    </div>
  );
}

export function RunProgress({ event }: { event: ProgressEvent | null }) {
  const percent = percentComplete(event);
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text-primary">{event?.phase ?? 'Starting'}</span>
        <span className="readout text-text-secondary">{pageLabel(event)}</span>
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

export function RunReceipt({ detail }: { detail: OcrRunDetail }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-armory-border bg-armory-elevated p-3">
      <StatusLine label="Recognition complete" tone="done" />
      <p className="text-sm leading-relaxed text-text-primary">{runReceipt(detail)}</p>
      <p className="text-xs text-text-muted">
        The text sits invisibly under the scan, so the page looks exactly the same. Save the
        document to keep it.
      </p>
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-danger/40 bg-armory-elevated p-3">
      <p className="text-sm leading-relaxed text-danger">{message}</p>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  onClick(): void;
  disabled?: boolean;
  variant?: 'primary' | 'quiet';
}

export function ActionButton({ label, onClick, disabled, variant = 'primary' }: ActionButtonProps) {
  const styles =
    variant === 'primary'
      ? 'bg-brand-700 text-text-on-brand hover:bg-brand-600 disabled:bg-armory-interactive disabled:text-text-muted'
      : 'border border-armory-border-strong text-text-secondary hover:bg-armory-interactive hover:text-text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed ${styles}`}
    >
      {label}
    </button>
  );
}

/**
 * The redaction panel's presentational pieces. Armory tokens only — no
 * hardcoded colours, no emojis. Movement is mandatory: while a run is going the
 * pulse, the bar and the page counter all move together (UI golden rules 2/7).
 */

import { Trash2 } from 'lucide-react';
import type { ProgressEvent, RedactVerifyResult, RedactionBox } from '@shared/types';
import {
  markLabel,
  percentComplete,
  proofText,
  progressLabel,
  receiptText,
} from './redact-messages';

export function PanelNotice({ children }: { children: string }) {
  return <p className="text-sm leading-relaxed text-text-secondary">{children}</p>;
}

export function StatusLine({ label, tone }: { label: string; tone: 'idle' | 'busy' | 'done' }) {
  const dot = {
    idle: 'bg-text-muted',
    busy: 'animate-pulse bg-purple-500',
    done: 'bg-status-operational',
  }[tone];
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="readout text-text-muted">{label}</span>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  onClick(): void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'quiet';
}

export function ActionButton({ label, onClick, disabled, variant = 'primary' }: ActionButtonProps) {
  const styles = {
    primary: 'bg-purple-700 text-text-primary hover:bg-purple-600',
    danger: 'bg-danger text-text-primary hover:brightness-110',
    quiet:
      'border border-armory-border-strong text-text-secondary hover:bg-armory-interactive hover:text-text-primary',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-armory-interactive disabled:text-text-muted ${styles}`}
    >
      {label}
    </button>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-danger/40 bg-armory-elevated p-3" role="alert">
      <p className="text-sm leading-relaxed text-danger">{message}</p>
    </div>
  );
}

export function WarningNotice({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-danger/40 bg-armory-elevated p-3">
      <p className="text-sm leading-relaxed text-text-primary">{children}</p>
    </div>
  );
}

export function RunProgress({ event }: { event: ProgressEvent | null }) {
  const percent = percentComplete(event);
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <span className="text-sm text-text-primary">{progressLabel(event)}</span>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-armory-interactive"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-purple-600 transition-[width] duration-200"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}

export function VerifiedReceipt({ receipt }: { receipt: RedactVerifyResult }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-armory-border bg-armory-elevated p-3">
      <StatusLine label="Redaction verified" tone="done" />
      <p className="text-sm leading-relaxed text-text-primary">{receiptText(receipt)}</p>
      <p className="text-xs leading-relaxed text-text-muted">{proofText(receipt)}</p>
    </div>
  );
}

export function CheckboxRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled === true}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-purple-600"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-text-primary">{label}</span>
        <span className="text-xs leading-relaxed text-text-muted">{hint}</span>
      </span>
    </label>
  );
}

interface MarkListProps {
  marks: readonly RedactionBox[];
  selectedId: string | null;
  onSelect(id: string): void;
  onRemove(id: string): void;
  disabled: boolean;
}

/** Every mark, listed. More than five scroll rather than push the panel down. */
export function MarkList({ marks, selectedId, onSelect, onRemove, disabled }: MarkListProps) {
  if (marks.length === 0) return null;
  return (
    <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
      {marks.map((mark) => (
        <li key={mark.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(mark.id)}
            className={`flex-1 truncate rounded-md px-2 py-1 text-left text-xs transition-colors duration-150 ${
              mark.id === selectedId
                ? 'bg-armory-interactive text-text-primary'
                : 'text-text-secondary hover:bg-armory-interactive'
            }`}
          >
            {markLabel(mark.page, mark.sourceMatch?.text)}
          </button>
          <button
            type="button"
            aria-label={`Remove the mark on page ${mark.page}`}
            disabled={disabled}
            onClick={() => onRemove(mark.id)}
            className="rounded-md p-1 text-text-muted transition-colors duration-150 hover:bg-armory-interactive hover:text-danger disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface SearchBoxProps {
  query: string;
  onQuery(value: string): void;
  onSearch(): void;
  searching: boolean;
  disabled: boolean;
}

export function SearchBox({ query, onQuery, onSearch, searching, disabled }: SearchBoxProps) {
  return (
    <div className="flex gap-2">
      <input
        type="search"
        value={query}
        placeholder="Find a term to mark"
        disabled={disabled}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSearch();
        }}
        className="min-w-0 flex-1 rounded-md border border-armory-border bg-armory-base px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-600 focus:outline-none disabled:text-text-muted"
      />
      <ActionButton
        label={searching ? 'Searching' : 'Find'}
        variant="quiet"
        disabled={disabled || searching || query.trim().length === 0}
        onClick={onSearch}
      />
    </div>
  );
}

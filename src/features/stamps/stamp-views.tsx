/**
 * The stamping panels' form controls and status strip. Armory tokens only —
 * no hardcoded colours, no emojis — and every control is labelled in the words
 * an attorney would use, not the words the PDF spec would.
 */

import type { ReactNode } from 'react';
import type { ProgressEvent } from '@shared/types';

const FIELD =
  'rounded-md border border-armory-border bg-armory-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-armory-focus';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-armory-border p-3 last:border-b-0">
      <h3 className="readout text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-text-secondary">{children}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange(value: string): void;
}

export function TextField({ label, value, placeholder, mono, onChange }: TextFieldProps) {
  return (
    <Field label={label}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD} ${mono === true ? 'font-mono' : ''}`}
      />
    </Field>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange(value: number): void;
}

export function NumberField({ label, value, min, max, step, onChange }: NumberFieldProps) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`${FIELD} font-mono`}
      />
    </Field>
  );
}

interface RangeFieldProps {
  pageCount: number;
  value: string;
  error: string | null;
  /** What happens when the range is good, e.g. "20 pages will be numbered." */
  note: string;
  onChange(value: string): void;
}

/** The page-range box every stamping section carries, with its own verdict. */
export function RangeField({ pageCount, value, error, note, onChange }: RangeFieldProps) {
  return (
    <>
      <Field label={`Pages (of ${pageCount})`}>
        <input
          value={value}
          placeholder="all, or 1-30, 45"
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD} font-mono`}
        />
      </Field>
      <p className={`text-xs ${error === null ? 'text-text-muted' : 'text-danger'}`}>
        {error ?? note}
      </p>
    </>
  );
}

interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
}

export function ChoiceField<T extends string>({ label, value, options, onChange }: ChoiceProps<T>) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2 py-1.5 text-xs transition-colors duration-150 ${
              option.value === value
                ? 'bg-purple-700 text-text-primary'
                : 'border border-armory-border text-text-secondary hover:bg-armory-interactive hover:text-text-primary'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-purple-600"
      />
      <span className="text-xs text-text-secondary">{label}</span>
    </label>
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
      ? 'bg-purple-700 text-text-primary hover:bg-purple-600 disabled:bg-armory-interactive disabled:text-text-muted'
      : 'border border-armory-border-strong text-text-secondary hover:bg-armory-interactive hover:text-text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      className={`rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed ${styles}`}
    >
      {label}
    </button>
  );
}

export function Problem({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-danger/40 bg-armory-elevated p-2 text-xs text-danger">
      {message}
    </p>
  );
}

/** A standing warning that is not an error — "this covers, it does not destroy". */
export function Caution({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-warning/40 bg-armory-elevated p-2 text-xs leading-relaxed text-warning">
      {children}
    </p>
  );
}

export function Receipt({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-armory-border bg-armory-elevated p-2">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-status-operational" />
      <p className="text-xs leading-relaxed text-text-primary">{message}</p>
    </div>
  );
}

/** Movement, always: the phase, the live page count, and a bar that fills. */
export function Working({ label, progress }: { label: string; progress: ProgressEvent | null }) {
  const percent =
    progress === null || progress.total === 0
      ? 0
      : Math.round((progress.current / progress.total) * 100);
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-xs text-text-primary">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-purple-500" />
          {progress?.phase ?? label}
        </span>
        <span className="readout text-text-secondary">
          {progress === null ? 'Starting' : `Page ${progress.current} / ${progress.total}`}
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
          className="h-full rounded-full bg-purple-600 transition-[width] duration-200"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}

interface RunStatusProps {
  busy: string | null;
  progress: ProgressEvent | null;
  error: string | null;
  receipt: string | null;
}

/** The one status strip every stamping panel shows: problem, movement, receipt. */
export function RunStatus({ busy, progress, error, receipt }: RunStatusProps) {
  return (
    <>
      {error !== null && <Problem message={error} />}
      {busy !== null && <Working label={busy} progress={progress} />}
      {receipt !== null && <Receipt message={receipt} />}
    </>
  );
}

export function EmptyPanel({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-sm text-text-secondary">{title}</p>
      <p className="text-xs text-text-muted">{summary}</p>
    </div>
  );
}

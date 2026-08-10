/**
 * How much of the document goes to Claude. Whole document is the default; the
 * page range exists for documents too large to send in one request, and the
 * current page is the quick "what am I looking at" case.
 */

import type { ContextMode } from './ask-payload';

const MODES: readonly { id: ContextMode; label: string }[] = [
  { id: 'whole', label: 'Whole document' },
  { id: 'range', label: 'Pages' },
  { id: 'current', label: 'Current page' },
];

interface ContextSelectorProps {
  mode: ContextMode;
  from: number;
  to: number;
  pageCount: number;
  summary: string;
  disabled: boolean;
  onModeChange(mode: ContextMode): void;
  onRangeChange(from: number, to: number): void;
}

function PageInput(props: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange(value: number): void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-text-muted">
      {props.label}
      <input
        type="number"
        min={1}
        max={props.max}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="w-14 rounded-md border border-armory-border bg-armory-base px-1.5 py-1 text-xs text-text-primary focus:border-armory-focus focus:outline-none disabled:text-text-muted"
      />
    </label>
  );
}

export function ContextSelector(props: ContextSelectorProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-armory-border p-3">
      <span className="readout text-text-muted">Context</span>
      <div className="flex gap-1">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={props.disabled}
            aria-pressed={props.mode === option.id}
            onClick={() => props.onModeChange(option.id)}
            className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors duration-150 disabled:text-text-muted ${
              props.mode === option.id
                ? 'bg-armory-interactive text-purple-400'
                : 'text-text-secondary hover:bg-armory-interactive hover:text-text-primary'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {props.mode === 'range' && (
        <div className="flex items-center gap-2">
          <PageInput
            label="From"
            value={props.from}
            max={props.pageCount}
            disabled={props.disabled}
            onChange={(value) => props.onRangeChange(value, props.to)}
          />
          <PageInput
            label="To"
            value={props.to}
            max={props.pageCount}
            disabled={props.disabled}
            onChange={(value) => props.onRangeChange(props.from, value)}
          />
        </div>
      )}
      <span className="text-xs text-text-muted">Sending {props.summary}.</span>
    </div>
  );
}

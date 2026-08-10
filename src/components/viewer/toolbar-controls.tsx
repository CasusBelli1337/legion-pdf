/**
 * Shared toolbar bits: the Armory button classes and the small numeric field
 * used for the page jump and the zoom box. Typing never moves the document —
 * the value is committed on Enter or when the field loses focus.
 */

import { useState } from 'react';

export const TOOLBAR_BUTTON =
  'flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors ' +
  'duration-150 hover:bg-armory-interactive hover:text-text-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

export const TOOLBAR_PRESET =
  'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors duration-150 ' +
  'hover:bg-armory-interactive hover:text-text-primary';

interface NumberFieldProps {
  label: string;
  value: number;
  suffix?: string;
  onCommit(value: number): void;
}

export function NumberField({ label, value, suffix, onCommit }: NumberFieldProps) {
  // The field shows the live value unless it is being edited, so scrolling the
  // document keeps the page box up to date without stealing what is being typed.
  const [edit, setEdit] = useState<string | null>(null);
  const draft = edit ?? String(value);

  const commit = (): void => {
    const parsed = Number.parseFloat(draft);
    setEdit(null);
    if (Number.isFinite(parsed)) onCommit(parsed);
  };

  return (
    <span className="flex items-center gap-1">
      <input
        className="h-6 w-12 rounded border border-armory-border bg-armory-base px-1.5 text-center font-mono text-xs text-text-primary focus:border-armory-focus focus:outline-none"
        value={draft}
        aria-label={label}
        onChange={(event) => setEdit(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          // Enter commits directly rather than through blur: a half-typed page
          // number must never survive on screen after the document has moved.
          if (event.key === 'Enter') {
            commit();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') setEdit(null);
        }}
      />
      {suffix !== undefined && <span className="readout text-text-muted">{suffix}</span>}
    </span>
  );
}

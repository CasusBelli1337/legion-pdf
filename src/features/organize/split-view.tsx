/**
 * Split view. Lives inside the dock panel rather than floating over the
 * document (UI golden rule 1), previews exactly what each new document will
 * contain, and refuses to send anything the parser cannot explain.
 */

import { useState } from 'react';
import type { DocumentSession } from '@shared/types';
import { describePart, parseRangeInput, type RangePart } from './range-input';

function SplitPreview({ parts, error }: { parts: RangePart[]; error: string | null }) {
  if (error !== null) return <p className="text-xs text-danger">{error}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {parts.map((part, index) => (
        <li key={part.spec} className="text-xs text-text-secondary">
          Document {index + 1}: {describePart(part)}
        </li>
      ))}
    </ul>
  );
}

interface SplitViewProps {
  session: DocumentSession;
  busy: boolean;
  onCancel(): void;
  onSplit(ranges: string[]): void;
}

export function SplitView({ session, busy, onCancel, onSplit }: SplitViewProps) {
  const [input, setInput] = useState(`1-${session.pageCount}`);
  const [touched, setTouched] = useState(false);
  const parsed = parseRangeInput(input, session.pageCount);

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-text-secondary">
        Each range becomes its own document, opened in a new tab. This document is not changed.
      </p>
      <label className="flex flex-col gap-1">
        <span className="readout text-text-muted">Page ranges</span>
        <input
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setTouched(true);
          }}
          placeholder="1-30, 31-60"
          className="rounded-md border border-armory-border bg-armory-base px-2 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-armory-focus"
        />
      </label>

      <SplitPreview parts={parsed.parts} error={touched ? parsed.error : null} />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || parsed.error !== null}
          onClick={() => onSplit(parsed.parts.map((part) => part.spec))}
          className="flex-1 rounded-md bg-purple-700 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-150 hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Split into {parsed.parts.length} documents
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-armory-border px-3 py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:border-armory-border-strong hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

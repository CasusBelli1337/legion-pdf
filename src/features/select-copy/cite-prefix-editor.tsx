/**
 * The inline editor for a document's cite prefix, opened from the pencil on the
 * "Copy with cite" row. It sits INSIDE the menu rather than in a settings panel
 * on purpose: the moment an attorney notices the cite is missing "Rothrock
 * Decl." is the moment he is looking at the cite, and sending him somewhere
 * else to fix it is how a feature goes unused.
 */

import { useEffect, useRef, useState } from 'react';

export interface CitePrefixEditorProps {
  value: string;
  onCommit: (prefix: string) => void;
  onCancel: () => void;
}

export function CitePrefixEditor({ value, onCommit, onCancel }: CitePrefixEditorProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.select(), []);

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <label className="readout text-text-muted" htmlFor="cite-prefix-input">
        Source label for this document
      </label>
      <input
        id="cite-prefix-input"
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit(draft.trim());
          if (event.key === 'Escape') onCancel();
        }}
        onBlur={() => onCommit(draft.trim())}
        placeholder="Cite prefix — e.g. Rothrock Decl."
        aria-label="Cite prefix for this document"
        className="h-6 w-full rounded border border-armory-border bg-armory-base px-2 text-xs text-text-primary focus:border-armory-focus focus:outline-none"
      />
      <span className="readout text-text-muted">Enter to save, Esc to cancel.</span>
    </div>
  );
}

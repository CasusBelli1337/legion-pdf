/**
 * The question box. Enter sends, Shift+Enter starts a new line - the shape a
 * chat box is expected to have, so nobody has to learn it.
 */

import { useState } from 'react';
import { SendHorizontal } from 'lucide-react';

interface ComposerProps {
  disabled: boolean;
  /** Plain-English reason the box is disabled, shown in place of the hint. */
  disabledReason: string | null;
  onSend(question: string): void;
}

export function Composer(props: ComposerProps) {
  const [question, setQuestion] = useState('');
  const canSend = !props.disabled && question.trim() !== '';

  function send(): void {
    if (!canSend) return;
    props.onSend(question.trim());
    setQuestion('');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    send();
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-armory-border p-3">
      <textarea
        rows={3}
        value={question}
        disabled={props.disabled}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about this document"
        aria-label="Ask about this document"
        className="resize-none rounded-md border border-armory-border bg-armory-base px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-armory-focus focus:outline-none disabled:text-text-muted"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">
          {props.disabledReason ?? 'Enter sends. Shift+Enter starts a new line.'}
        </span>
        <button
          type="button"
          disabled={!canSend}
          onClick={send}
          aria-label="Send question"
          className="flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-text-on-brand transition-colors duration-150 hover:bg-brand-600 disabled:bg-armory-interactive disabled:text-text-muted"
        >
          <SendHorizontal size={14} aria-hidden />
          Ask
        </button>
      </div>
    </div>
  );
}

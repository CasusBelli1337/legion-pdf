/**
 * The conversation. Answers stream in word by word, and while nothing is
 * arriving yet a pulsing indicator says so in plain English - the panel never
 * sits still while work is happening (UI golden rule 2).
 */

import { useEffect, useRef } from 'react';
import type { CenturionThread } from './centurion-store';

function Bubble(props: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = props.role === 'user';
  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <span className="readout text-text-muted">{isUser ? 'You' : 'Centurion'}</span>
      <div
        className={`max-w-full whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-armory-interactive text-text-primary'
            : 'border border-armory-border bg-armory-elevated text-text-secondary'
        }`}
      >
        {props.children}
      </div>
    </div>
  );
}

function Working(props: { attempt: number }) {
  const label =
    props.attempt > 1
      ? 'That answer was cut off. Asking again with more room...'
      : 'Centurion is reading the document...';
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 animate-pulse rounded-full bg-purple-500" />
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

export function MessageList(props: { thread: CenturionThread }) {
  const { thread } = props;
  const endRef = useRef<HTMLDivElement>(null);
  const busy = thread.status !== 'idle';

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.turns.length, thread.streamingText, thread.status]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {thread.turns.length === 0 && !busy && (
        <p className="text-sm leading-relaxed text-text-secondary">
          Ask anything about this document - what it is, who the parties are, what a clause says.
          Centurion answers only from the pages you send it, and cites the page numbers.
        </p>
      )}
      {thread.turns.map((turn) => (
        <Bubble key={turn.id} role={turn.role}>
          {turn.content}
        </Bubble>
      ))}
      {thread.streamingText !== '' && <Bubble role="assistant">{thread.streamingText}</Bubble>}
      {busy && <Working attempt={thread.attempt} />}
      {thread.error !== null && (
        <p className="rounded-md border border-danger/40 bg-armory-elevated px-3 py-2 text-xs leading-relaxed text-danger">
          {thread.error}
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}

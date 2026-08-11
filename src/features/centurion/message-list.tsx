/**
 * The conversation. Questions, answers, and the confirm cards for anything
 * Centurion proposed to do, in the order they happened. Answers stream in word
 * by word, and while nothing is arriving yet a pulsing indicator says so in
 * plain English - the panel never sits still while work is happening
 * (UI golden rule 2).
 */

import { useEffect, useRef } from 'react';
import { isCard } from './centurion-store';
import type { CenturionCard, CenturionThread } from './centurion-store';
import { ToolCard } from './tool-card';

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

function Working(props: { attempt: number; awaitingAnswer: boolean }) {
  if (props.awaitingAnswer) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        <span className="text-xs text-text-muted">Waiting for your answer above.</span>
      </div>
    );
  }
  const label =
    props.attempt > 1
      ? 'That answer was cut off. Asking again with more room...'
      : 'Centurion is reading the document...';
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

interface MessageListProps {
  thread: CenturionThread;
  docId: string;
  onDecide(card: CenturionCard, approved: boolean): void;
}

export function MessageList({ thread, docId, onDecide }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const busy = thread.status !== 'idle';
  const awaitingAnswer = thread.entries.some(
    (entry) => isCard(entry) && entry.status === 'pending'
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.entries.length, thread.streamingText, thread.status]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {thread.entries.length === 0 && !busy && (
        <p className="text-sm leading-relaxed text-text-secondary">
          Ask anything about this document - what it is, who the parties are, what a clause says.
          Centurion answers only from the pages you send it, and cites the page numbers. With tools
          on it can also offer to stamp, number, bookmark, or mark redactions, and nothing happens
          until you approve it.
        </p>
      )}
      {thread.entries.map((entry) =>
        isCard(entry) ? (
          <ToolCard
            key={entry.id}
            card={entry}
            docId={docId}
            onDecide={(approved) => onDecide(entry, approved)}
          />
        ) : (
          <Bubble key={entry.id} role={entry.role}>
            {entry.content}
          </Bubble>
        )
      )}
      {thread.streamingText !== '' && <Bubble role="assistant">{thread.streamingText}</Bubble>}
      {busy && <Working attempt={thread.attempt} awaitingAnswer={awaitingAnswer} />}
      {thread.error !== null && (
        <p className="rounded-md border border-danger/40 bg-armory-elevated px-3 py-2 text-xs leading-relaxed text-danger">
          {thread.error}
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}

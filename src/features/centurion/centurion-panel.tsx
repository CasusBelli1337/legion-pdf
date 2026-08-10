/**
 * The Centurion dock panel: key setup until a key exists, then the chat.
 * It only ever learns whether a key exists - the key itself lives in the main
 * process and is never sent here (engineering rule 4).
 */

import { useEffect } from 'react';
import type { DocumentSession } from '@shared/types';
import { useActiveSession, useAppStore } from '@renderer/app/store';
import { contextLabel } from './ask-payload';
import type { ContextMode } from './ask-payload';
import { askCenturion, clearKey, refreshKeyStatus, subscribeToChunks } from './centurion-actions';
import { EMPTY_THREAD, useCenturionStore } from './centurion-store';
import { Composer } from './composer';
import { ContextSelector } from './context-selector';
import { KeySetup } from './key-setup';
import { MessageList } from './message-list';

/** A first switch to "Pages" opens a usable window at the current page, not 1-1. */
const DEFAULT_RANGE_SPAN = 20;

function SettingsRow(props: { onClear: () => void; onNewConversation: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-armory-border px-3 py-2">
      <button
        type="button"
        onClick={props.onNewConversation}
        className="text-xs text-text-muted transition-colors duration-150 hover:text-text-primary"
      >
        New conversation
      </button>
      <button
        type="button"
        onClick={props.onClear}
        className="text-xs text-text-muted transition-colors duration-150 hover:text-danger"
      >
        Remove saved key
      </button>
    </div>
  );
}

function Waiting(props: { message: string }) {
  return <p className="p-4 text-sm leading-relaxed text-text-secondary">{props.message}</p>;
}

function ChatSurface(props: { session: DocumentSession; currentPage: number }) {
  const { session, currentPage } = props;
  const busy = useCenturionStore((state) => state.askingDocId !== null);
  // EMPTY_THREAD, never blankThread(): a fresh object here would make the
  // snapshot unstable and React would re-render this panel forever.
  const thread = useCenturionStore((state) => state.threads[session.id] ?? EMPTY_THREAD);
  const { setContextMode, setRange, clearThread } = useCenturionStore.getState();

  const selection = {
    mode: thread.contextMode,
    from: thread.rangeFrom,
    to: thread.rangeTo,
    currentPage,
    pageCount: session.pageCount,
  };

  function chooseMode(mode: ContextMode): void {
    if (mode === 'range' && thread.rangeFrom === 1 && thread.rangeTo === 1) {
      setRange(
        session.id,
        currentPage,
        Math.min(currentPage + DEFAULT_RANGE_SPAN - 1, session.pageCount)
      );
    }
    setContextMode(session.id, mode);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ContextSelector
        mode={thread.contextMode}
        from={thread.rangeFrom}
        to={thread.rangeTo}
        pageCount={session.pageCount}
        summary={contextLabel(selection)}
        disabled={busy}
        onModeChange={chooseMode}
        onRangeChange={(from, to) => setRange(session.id, from, to)}
      />
      <MessageList thread={thread} />
      {/* Keyed by document: a half-typed question belongs to the tab it was
          typed in, and must not follow the attorney to the next document. */}
      <Composer
        key={session.id}
        disabled={busy}
        disabledReason={busy ? 'Waiting for Centurion to finish.' : null}
        onSend={(question) => void askCenturion(session, currentPage, question)}
      />
      <SettingsRow
        onClear={() => void clearKey()}
        onNewConversation={() => clearThread(session.id)}
      />
    </div>
  );
}

export function CenturionPanel() {
  const session = useActiveSession();
  const currentPage = useAppStore((state) => state.currentPage);
  const hasKey = useCenturionStore((state) => state.hasKey);

  useEffect(() => subscribeToChunks(), []);
  useEffect(() => {
    void refreshKeyStatus();
  }, []);

  if (hasKey === null) return <Waiting message="Checking for a saved API key..." />;
  if (!hasKey) return <KeySetup />;
  if (session === null) return <Waiting message="Open a PDF and Centurion will read it for you." />;
  return <ChatSurface session={session} currentPage={currentPage} />;
}

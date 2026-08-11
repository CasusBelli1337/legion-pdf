/**
 * The Centurion dock panel: key setup until a key exists, then the chat.
 * It only ever learns whether a key exists - the key itself lives in the main
 * process and is never sent here (engineering rule 4).
 */

import { useEffect } from 'react';
import type { DocumentSession } from '@shared/types';
import { useActiveSession, useAppStore } from '@renderer/app/store';
import { useViewerApi } from '@renderer/components/viewer';
import { contextLabel } from './ask-payload';
import type { ContextMode } from './ask-payload';
import {
  askCenturion,
  clearKey,
  decideTool,
  refreshKeyStatus,
  subscribeToChunks,
} from './centurion-actions';
import { EMPTY_THREAD, useCenturionStore } from './centurion-store';
import type { CenturionThread } from './centurion-store';
import { Composer } from './composer';
import { ContextSelector } from './context-selector';
import { KeySetup } from './key-setup';
import { MessageList } from './message-list';
import { QuickActions, ToolsToggle } from './tools-bar';

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
  const api = useViewerApi();
  const busy = useCenturionStore((state) => state.askingDocId !== null);
  // EMPTY_THREAD, never blankThread(): a fresh object here would make the
  // snapshot unstable and React would re-render this panel forever.
  const thread = useCenturionStore((state) => state.threads[session.id] ?? EMPTY_THREAD);
  const { setToolsEnabled, clearThread } = useCenturionStore.getState();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ContextRow session={session} thread={thread} currentPage={currentPage} disabled={busy} />
      <MessageList
        thread={thread}
        docId={session.id}
        onDecide={(card, approved) => void decideTool(card, approved, api)}
      />
      <AskRow
        session={session}
        currentPage={currentPage}
        busy={busy}
        showExamples={thread.toolsEnabled && thread.entries.length === 0}
        toolsEnabled={thread.toolsEnabled}
        onToolsChange={(enabled) => setToolsEnabled(session.id, enabled)}
      />
      <SettingsRow
        onClear={() => void clearKey()}
        onNewConversation={() => clearThread(session.id)}
      />
    </div>
  );
}

interface ContextRowProps {
  session: DocumentSession;
  thread: CenturionThread;
  currentPage: number;
  disabled: boolean;
}

/** How much of the document goes to Claude, and what that reads as in English. */
function ContextRow({ session, thread, currentPage, disabled }: ContextRowProps) {
  const { setContextMode, setRange } = useCenturionStore.getState();
  const selection = {
    mode: thread.contextMode,
    from: thread.rangeFrom,
    to: thread.rangeTo,
    currentPage,
    pageCount: session.pageCount,
  };

  function chooseMode(mode: ContextMode): void {
    if (mode === 'range' && thread.rangeFrom === 1 && thread.rangeTo === 1) {
      const to = Math.min(currentPage + DEFAULT_RANGE_SPAN - 1, session.pageCount);
      setRange(session.id, currentPage, to);
    }
    setContextMode(session.id, mode);
  }

  return (
    <ContextSelector
      mode={thread.contextMode}
      from={thread.rangeFrom}
      to={thread.rangeTo}
      pageCount={session.pageCount}
      summary={contextLabel(selection)}
      disabled={disabled}
      onModeChange={chooseMode}
      onRangeChange={(from, to) => setRange(session.id, from, to)}
    />
  );
}

interface AskRowProps {
  session: DocumentSession;
  currentPage: number;
  busy: boolean;
  showExamples: boolean;
  toolsEnabled: boolean;
  onToolsChange(enabled: boolean): void;
}

/** Everything under the conversation: the examples, the box, and the switch. */
function AskRow(props: AskRowProps) {
  const ask = (question: string): void => {
    void askCenturion(props.session, props.currentPage, question);
  };
  return (
    <>
      {props.showExamples && <QuickActions disabled={props.busy} onPick={ask} />}
      {/* Keyed by document: a half-typed question belongs to the tab it was
          typed in, and must not follow the attorney to the next document. */}
      <Composer
        key={props.session.id}
        disabled={props.busy}
        disabledReason={props.busy ? 'Waiting for Centurion to finish.' : null}
        onSend={ask}
      />
      <ToolsToggle enabled={props.toolsEnabled} onChange={props.onToolsChange} />
    </>
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

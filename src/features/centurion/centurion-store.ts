/**
 * Centurion's conversation state, one thread per open document tab, held for
 * the session only - nothing here is written to disk, and closing the tab
 * forgets it.
 *
 * A thread is a list of ENTRIES, not just messages: the attorney's questions,
 * Centurion's answers, and the confirm cards for anything it proposed to DO,
 * in the order they happened. A card is the only place an action is approved,
 * so it stays in the thread afterwards as the record of what was done.
 *
 * Streaming is keyed by attempt: main gives every attempt its own requestId, so
 * a retry after a clipped answer arrives under a NEW id and the panel throws the
 * partial text away instead of appending to it. That is how engineering rule 3
 * ("a clipped answer is never displayed as finished") shows up in the UI.
 */

import { create } from 'zustand';
import type {
  AiChunk,
  CenturionErrorCode,
  CenturionToolName,
  CenturionToolProposal,
} from '@shared/types';
import type { ContextMode } from './ask-payload';

export type CenturionStatus = 'idle' | 'working' | 'streaming';

/** Where a confirm card is up to. 'skipped' is a normal end, never a failure. */
export type CenturionCardStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface CenturionTurn {
  kind: 'turn';
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/** One proposed action, awaiting the attorney or settled. Keyed by tool_use id. */
export interface CenturionCard {
  kind: 'card';
  id: string;
  /** The attempt that proposed it — half of what `ai:toolDecision` answers. */
  requestId: string;
  name: CenturionToolName;
  summary: string;
  input: unknown;
  status: CenturionCardStatus;
  /** The line under the card once it settles: the receipt, or why it did not run. */
  result: string | null;
}

export type CenturionEntry = CenturionTurn | CenturionCard;

export function isCard(entry: CenturionEntry): entry is CenturionCard {
  return entry.kind === 'card';
}

export function isTurn(entry: CenturionEntry): entry is CenturionTurn {
  return entry.kind === 'turn';
}

export interface CenturionThread {
  entries: CenturionEntry[];
  /** The attempt whose deltas are on screen; null when nothing is streaming. */
  streamingRequestId: string | null;
  streamingText: string;
  /** Counts from 1; a 2 means the first answer was clipped and is being redone. */
  attempt: number;
  status: CenturionStatus;
  error: string | null;
  contextMode: ContextMode;
  rangeFrom: number;
  rangeTo: number;
  /** Offer Centurion the document tools. On by default whenever a PDF is open. */
  toolsEnabled: boolean;
}

export interface CenturionState {
  threads: Record<string, CenturionThread>;
  /** null until the main process has been asked. */
  hasKey: boolean | null;
  /** The document a request is in flight for, so chunks route to the right thread. */
  askingDocId: string | null;
  /**
   * The taxonomy code from the last failed ask. It arrives on the terminal
   * chunk, since an Error crossing IPC keeps only its message.
   */
  failureCode: CenturionErrorCode | null;

  setHasKey(hasKey: boolean): void;
  setContextMode(docId: string, mode: ContextMode): void;
  setRange(docId: string, from: number, to: number): void;
  setToolsEnabled(docId: string, enabled: boolean): void;
  startAsk(docId: string, question: string): void;
  applyChunk(chunk: AiChunk): void;
  /** Local, optimistic: the attorney pressed Approve and the work has begun. */
  markCardRunning(cardId: string): void;
  settleCard(cardId: string, status: CenturionCardStatus, result: string): void;
  finishAsk(text: string): void;
  failAsk(message: string): void;
  clearThread(docId: string): void;
}

type Setter = (updater: (state: CenturionState) => Partial<CenturionState>) => void;

export function blankThread(): CenturionThread {
  return {
    entries: [],
    streamingRequestId: null,
    streamingText: '',
    attempt: 0,
    status: 'idle',
    error: null,
    contextMode: 'whole',
    rangeFrom: 1,
    rangeTo: 1,
    toolsEnabled: true,
  };
}

/**
 * The single shared "no thread yet" object. A React selector MUST return this
 * rather than calling `blankThread()`: a fresh object on every read makes
 * zustand's getSnapshot unstable and React re-renders forever.
 */
export const EMPTY_THREAD: CenturionThread = Object.freeze(blankThread());

function newTurnId(): string {
  return globalThis.crypto.randomUUID();
}

function turn(role: 'user' | 'assistant', content: string): CenturionTurn {
  return { kind: 'turn', id: newTurnId(), role, content };
}

function withThread(
  state: CenturionState,
  docId: string,
  update: (thread: CenturionThread) => CenturionThread
): Pick<CenturionState, 'threads'> {
  const current = state.threads[docId] ?? blankThread();
  return { threads: { ...state.threads, [docId]: update(current) } };
}

/** Clears the streaming scratch buffer; the entry list is left alone. */
function settled(thread: CenturionThread): CenturionThread {
  return { ...thread, streamingRequestId: null, streamingText: '', attempt: 0, status: 'idle' };
}

/** End the in-flight request and update its thread in one move. */
function settleThread(
  state: CenturionState,
  update: (thread: CenturionThread) => CenturionThread
): Partial<CenturionState> {
  if (state.askingDocId === null) return {};
  return {
    askingDocId: null,
    ...withThread(state, state.askingDocId, (thread) => update(settled(thread))),
  };
}

/** A delta under an unseen requestId means a fresh attempt: discard, do not append. */
function applyDelta(thread: CenturionThread, chunk: AiChunk): CenturionThread {
  const isRetry =
    thread.streamingRequestId !== null && thread.streamingRequestId !== chunk.requestId;
  return {
    ...thread,
    streamingRequestId: chunk.requestId,
    streamingText: isRetry ? chunk.text : thread.streamingText + chunk.text,
    attempt: isRetry ? thread.attempt + 1 : Math.max(1, thread.attempt),
    status: 'streaming',
  };
}

const OUTCOME_STATUS: Record<'done' | 'skipped' | 'failed', CenturionCardStatus> = {
  done: 'done',
  skipped: 'skipped',
  failed: 'failed',
};

/** Cards arrive twice: once awaiting an answer, once settled. Match on tool_use id. */
function applyProposal(
  thread: CenturionThread,
  requestId: string,
  proposal: CenturionToolProposal
): CenturionThread {
  const known = thread.entries.some((entry) => isCard(entry) && entry.id === proposal.toolUseId);
  const result = proposal.result;
  if (result !== undefined) {
    return updateCard(thread, proposal.toolUseId, {
      status: OUTCOME_STATUS[result.outcome],
      result: result.message,
    });
  }
  if (known) return thread;
  const card: CenturionCard = {
    kind: 'card',
    id: proposal.toolUseId,
    requestId,
    name: proposal.name,
    summary: proposal.summary,
    input: proposal.input,
    status: 'pending',
    result: null,
  };
  return { ...thread, entries: [...thread.entries, card] };
}

function updateCard(
  thread: CenturionThread,
  cardId: string,
  patch: Partial<CenturionCard>
): CenturionThread {
  return {
    ...thread,
    entries: thread.entries.map((entry) =>
      isCard(entry) && entry.id === cardId ? { ...entry, ...patch } : entry
    ),
  };
}

/** Card edits can land after the ask ended, so they search every thread. */
function patchCardEverywhere(
  state: CenturionState,
  cardId: string,
  patch: Partial<CenturionCard>
): Partial<CenturionState> {
  const threads = Object.fromEntries(
    Object.entries(state.threads).map(([docId, thread]) => [
      docId,
      updateCard(thread, cardId, patch),
    ])
  );
  return { threads };
}

function threadActions(
  set: Setter
): Pick<CenturionState, 'setContextMode' | 'setRange' | 'setToolsEnabled' | 'clearThread'> {
  return {
    setContextMode: (docId, contextMode) =>
      set((state) => withThread(state, docId, (thread) => ({ ...thread, contextMode }))),

    setRange: (docId, rangeFrom, rangeTo) =>
      set((state) => withThread(state, docId, (thread) => ({ ...thread, rangeFrom, rangeTo }))),

    setToolsEnabled: (docId, toolsEnabled) =>
      set((state) => withThread(state, docId, (thread) => ({ ...thread, toolsEnabled }))),

    clearThread: (docId) =>
      set((state) => ({
        askingDocId: state.askingDocId === docId ? null : state.askingDocId,
        ...withThread(state, docId, (thread) => ({
          ...blankThread(),
          contextMode: thread.contextMode,
          rangeFrom: thread.rangeFrom,
          rangeTo: thread.rangeTo,
          toolsEnabled: thread.toolsEnabled,
        })),
      })),
  };
}

type AskActions = Pick<
  CenturionState,
  'startAsk' | 'applyChunk' | 'finishAsk' | 'failAsk' | 'markCardRunning' | 'settleCard'
>;

function askActions(set: Setter): AskActions {
  return {
    startAsk: (docId, question) =>
      set((state) => ({
        askingDocId: docId,
        failureCode: null,
        ...withThread(state, docId, (thread) => ({
          ...settled(thread),
          entries: [...thread.entries, turn('user', question)],
          status: 'working',
          error: null,
        })),
      })),

    // A terminal chunk moves no text: finishAsk / failAsk own that transition, so
    // the answer never blinks out between the two. All it carries is the failure
    // code, which the catch in centurion-actions pairs with the message.
    applyChunk: (chunk) =>
      set((state) => {
        if (chunk.done) return chunk.code === undefined ? {} : { failureCode: chunk.code };
        if (state.askingDocId === null) return {};
        const proposal = chunk.proposal;
        return withThread(state, state.askingDocId, (thread) =>
          proposal === undefined
            ? applyDelta(thread, chunk)
            : applyProposal(thread, chunk.requestId, proposal)
        );
      }),

    markCardRunning: (cardId) =>
      set((state) => patchCardEverywhere(state, cardId, { status: 'running', result: null })),

    settleCard: (cardId, status, result) =>
      set((state) => patchCardEverywhere(state, cardId, { status, result })),

    finishAsk: (text) =>
      set((state) =>
        settleThread(state, (thread) => ({
          ...thread,
          entries: [...thread.entries, turn('assistant', text)],
          error: null,
        }))
      ),

    failAsk: (message) =>
      set((state) => settleThread(state, (thread) => ({ ...thread, error: message }))),
  };
}

export const useCenturionStore = create<CenturionState>((set) => ({
  threads: {},
  hasKey: null,
  askingDocId: null,
  failureCode: null,
  setHasKey: (hasKey) => set(() => ({ hasKey })),
  ...threadActions(set),
  ...askActions(set),
}));

/** Read a thread outside React (IPC callbacks, action modules). */
export function threadOf(docId: string | null): CenturionThread {
  if (docId === null) return EMPTY_THREAD;
  return useCenturionStore.getState().threads[docId] ?? EMPTY_THREAD;
}

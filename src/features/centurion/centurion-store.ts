/**
 * Centurion's conversation state, one thread per open document tab, held for
 * the session only - nothing here is written to disk, and closing the tab
 * forgets it.
 *
 * Streaming is keyed by attempt: main gives every attempt its own requestId, so
 * a retry after a clipped answer arrives under a NEW id and the panel throws the
 * partial text away instead of appending to it. That is how engineering rule 3
 * ("a clipped answer is never displayed as finished") shows up in the UI.
 */

import { create } from 'zustand';
import type { AiChunk, CenturionErrorCode } from '@shared/types';
import type { ContextMode } from './ask-payload';

export type CenturionStatus = 'idle' | 'working' | 'streaming';

export interface CenturionTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface CenturionThread {
  turns: CenturionTurn[];
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
  startAsk(docId: string, question: string): void;
  applyChunk(chunk: AiChunk): void;
  finishAsk(text: string): void;
  failAsk(message: string): void;
  clearThread(docId: string): void;
}

type Setter = (updater: (state: CenturionState) => Partial<CenturionState>) => void;

export function blankThread(): CenturionThread {
  return {
    turns: [],
    streamingRequestId: null,
    streamingText: '',
    attempt: 0,
    status: 'idle',
    error: null,
    contextMode: 'whole',
    rangeFrom: 1,
    rangeTo: 1,
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

function withThread(
  state: CenturionState,
  docId: string,
  update: (thread: CenturionThread) => CenturionThread
): Pick<CenturionState, 'threads'> {
  const current = state.threads[docId] ?? blankThread();
  return { threads: { ...state.threads, [docId]: update(current) } };
}

/** Clears the streaming scratch buffer; the turn list is left alone. */
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

function threadActions(
  set: Setter
): Pick<CenturionState, 'setContextMode' | 'setRange' | 'clearThread'> {
  return {
    setContextMode: (docId, contextMode) =>
      set((state) => withThread(state, docId, (thread) => ({ ...thread, contextMode }))),

    setRange: (docId, rangeFrom, rangeTo) =>
      set((state) => withThread(state, docId, (thread) => ({ ...thread, rangeFrom, rangeTo }))),

    clearThread: (docId) =>
      set((state) => ({
        askingDocId: state.askingDocId === docId ? null : state.askingDocId,
        ...withThread(state, docId, (thread) => ({
          ...blankThread(),
          contextMode: thread.contextMode,
          rangeFrom: thread.rangeFrom,
          rangeTo: thread.rangeTo,
        })),
      })),
  };
}

function askActions(
  set: Setter
): Pick<CenturionState, 'startAsk' | 'applyChunk' | 'finishAsk' | 'failAsk'> {
  return {
    startAsk: (docId, question) =>
      set((state) => ({
        askingDocId: docId,
        failureCode: null,
        ...withThread(state, docId, (thread) => ({
          ...settled(thread),
          turns: [...thread.turns, { id: newTurnId(), role: 'user', content: question }],
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
        return withThread(state, state.askingDocId, (thread) => applyDelta(thread, chunk));
      }),

    finishAsk: (text) =>
      set((state) =>
        settleThread(state, (thread) => ({
          ...thread,
          turns: [...thread.turns, { id: newTurnId(), role: 'assistant', content: text }],
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

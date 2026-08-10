/**
 * Every Centurion action in one place, as plain functions against the store -
 * the same shape as src/app/document-actions.ts, so a button, a keyboard
 * shortcut, and a retry all share one implementation.
 */

import type { AiMessage, DocumentSession } from '@shared/types';
import { extractDocumentText } from '@renderer/lib/extract-text';
import { buildAskPayload, selectedPages } from './ask-payload';
import type { ContextSelection } from './ask-payload';
import { threadOf, useCenturionStore } from './centurion-store';
import { isMissingKey, readFailure } from './error-text';

function store(): ReturnType<typeof useCenturionStore.getState> {
  return useCenturionStore.getState();
}

/** Ask main whether a key exists. The key itself never crosses this boundary. */
export async function refreshKeyStatus(): Promise<void> {
  try {
    const status = await window.librarius.ai.hasKey();
    store().setHasKey(status.hasKey);
  } catch {
    store().setHasKey(false);
  }
}

export async function saveKey(key: string): Promise<string | null> {
  try {
    const status = await window.librarius.ai.setKey(key);
    store().setHasKey(status.hasKey);
    return null;
  } catch (error) {
    return readFailure(error).message;
  }
}

export async function clearKey(): Promise<void> {
  try {
    const status = await window.librarius.ai.clearKey();
    store().setHasKey(status.hasKey);
  } catch {
    store().setHasKey(false);
  }
}

/** The conversation so far, plus the new question, in the wire shape. */
function conversation(docId: string, question: string): AiMessage[] {
  return [
    ...threadOf(docId).turns.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user' as const, content: question },
  ];
}

function selectionFor(session: DocumentSession, currentPage: number): ContextSelection {
  const thread = threadOf(session.id);
  return {
    mode: thread.contextMode,
    from: thread.rangeFrom,
    to: thread.rangeTo,
    currentPage,
    pageCount: session.pageCount,
  };
}

/**
 * Extract the selected context, send it, and stream the answer back. The panel
 * shows movement throughout: `startAsk` flips the thread to "working", the
 * chunk subscription flips it to "streaming" on the first delta.
 */
export async function askCenturion(
  session: DocumentSession,
  currentPage: number,
  question: string
): Promise<void> {
  const trimmed = question.trim();
  if (trimmed === '' || store().askingDocId !== null) return;

  const selection = selectionFor(session, currentPage);
  const messages = conversation(session.id, trimmed);
  store().startAsk(session.id, trimmed);
  try {
    const extracted = await extractDocumentText(session.bytes, selectedPages(selection));
    const payload = buildAskPayload(session.id, messages, selection, extracted.text);
    const result = await window.librarius.ai.ask(payload);
    store().finishAsk(result.text);
  } catch (error) {
    // The code came in on the terminal chunk; the rejection carries the sentence.
    const failure = readFailure(error, store().failureCode);
    store().failAsk(failure.message);
    // The key can disappear between turns (cleared here or in another window);
    // when main says so, drop straight back to key setup rather than looping.
    if (isMissingKey(failure)) store().setHasKey(false);
  }
}

/** Wire the chunk stream into the store. Call once; the return value unsubscribes. */
export function subscribeToChunks(): () => void {
  return window.librarius.ai.onChunk((chunk) => store().applyChunk(chunk));
}

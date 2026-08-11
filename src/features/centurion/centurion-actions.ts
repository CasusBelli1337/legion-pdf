/**
 * Every Centurion action in one place, as plain functions against the store -
 * the same shape as src/app/document-actions.ts, so a button, a keyboard
 * shortcut, and a retry all share one implementation.
 */

import type { AiChunk, AiMessage, CenturionToolDecision, DocumentSession } from '@shared/types';
import { validateToolCall } from '@shared/centurion-tools';
import { useAppStore } from '@renderer/app/store';
import { extractDocumentText } from '@renderer/lib/extract-text';
import type { ViewerApi } from '@renderer/components/viewer';
import { buildAskPayload, selectedPages } from './ask-payload';
import type { ContextSelection } from './ask-payload';
import { isTurn, threadOf, useCenturionStore } from './centurion-store';
import type { CenturionCard } from './centurion-store';
import { isMissingKey, readFailure } from './error-text';
import { markSuggestedTerms } from './redaction-handshake';

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

/**
 * The conversation so far, plus the new question, in the wire shape. Confirm
 * cards are UI entries, not turns: what Centurion did is already in the answer
 * it wrote about doing it.
 */
function conversation(docId: string, question: string): AiMessage[] {
  return [
    ...threadOf(docId)
      .entries.filter(isTurn)
      .map((entry) => ({ role: entry.role, content: entry.content })),
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
  const toolsEnabled = threadOf(session.id).toolsEnabled;
  store().startAsk(session.id, trimmed);
  try {
    const extracted = await extractDocumentText(session.bytes, selectedPages(selection));
    const payload = buildAskPayload(session.id, messages, selection, extracted.text, toolsEnabled);
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
  return window.librarius.ai.onChunk((chunk) => {
    store().applyChunk(chunk);
    void refreshAfterTool(chunk);
  });
}

/**
 * UI golden rule 3: a tool that rewrote the document has to show up in the
 * viewer without the attorney refreshing anything. Redaction marks change no
 * bytes, so they need no re-read.
 */
async function refreshAfterTool(chunk: AiChunk): Promise<void> {
  const proposal = chunk.proposal;
  const docId = store().askingDocId;
  if (proposal?.result?.outcome !== 'done' || docId === null) return;
  if (proposal.name === 'suggestRedactions') return;
  try {
    useAppStore.getState().replaceSession(await window.librarius.file.read(docId));
  } catch (error) {
    // The card already told the truth about what changed; the viewer catches up
    // on the next read rather than the attorney seeing a second error.
    useAppStore.getState().setError(readFailure(error).message);
  }
}

/** Tell main what the attorney chose. A card that cannot answer is settled here. */
async function answer(card: CenturionCard, decision: CenturionToolDecision): Promise<void> {
  try {
    await window.librarius.ai.toolDecision(card.requestId, card.id, decision);
  } catch (error) {
    store().settleCard(card.id, 'failed', readFailure(error).message);
  }
}

/**
 * Approve or skip one confirm card. Everything but redaction runs in the main
 * process against the document's bytes; redaction is marked here in the viewer
 * and never applied (engineering rule 2).
 */
export async function decideTool(
  card: CenturionCard,
  approved: boolean,
  api: ViewerApi | null
): Promise<void> {
  if (card.status !== 'pending') return;
  if (!approved) {
    store().settleCard(card.id, 'skipped', 'Skipped.');
    await answer(card, { verdict: 'rejected', detail: 'Skipped.' });
    return;
  }
  store().markCardRunning(card.id);
  if (card.name === 'suggestRedactions') {
    await markTerms(card, api);
    return;
  }
  // Main runs it and settles the card with its receipt on the next `ai:chunk`.
  await answer(card, 'approved');
}

async function markTerms(card: CenturionCard, api: ViewerApi | null): Promise<void> {
  if (api === null) {
    const detail = 'That document is not open in the viewer, so nothing could be marked.';
    store().settleCard(card.id, 'failed', detail);
    await answer(card, { verdict: 'rejected', detail });
    return;
  }
  try {
    const call = validateToolCall(card.name, card.input);
    if (call.name !== 'suggestRedactions') return;
    const outcome = await markSuggestedTerms(api, call.input.terms);
    store().settleCard(card.id, 'done', outcome.detail);
    await answer(card, { verdict: 'approved', detail: outcome.detail });
  } catch (error) {
    const message = readFailure(error).message;
    store().settleCard(card.id, 'failed', message);
    await answer(card, { verdict: 'rejected', detail: `Nothing was marked: ${message}` });
  }
}

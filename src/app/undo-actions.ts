/**
 * Undo/Redo for the DOCUMENT — the owner's ask: a way back from any change to
 * the PDF, whatever made it (Bates, watermark, rotate, delete pages, OCR).
 *
 * The history itself is main-process state: it wraps the doc store's bytes, so
 * every op is covered without each op knowing about undo. Here we step it and
 * then do exactly what every other op does when it finishes — re-read the
 * document and swap the session in, which is what re-renders the viewer.
 */

import type { UndoState } from '@shared/types';
import { useAppStore } from './store';

type Step = 'undo' | 'redo';

/** What the controls show before any document has been asked about. */
export const NO_HISTORY: UndoState = { canUndo: false, canRedo: false };

const BUSY: Record<Step, string> = {
  undo: 'Undoing the last change',
  redo: 'Redoing that change',
};

const DONE: Record<Step, string> = {
  undo: 'Change undone.',
  redo: 'Change redone.',
};

const NOTHING: Record<Step, string> = {
  undo: 'There is nothing left to undo.',
  redo: 'There is nothing to redo.',
};

const FAILED: Record<Step, string> = {
  undo: 'Could not undo that change:',
  redo: 'Could not redo that change:',
};

/** Plain English for the attorney, never a stack trace. */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA']);

/**
 * Ctrl+Z inside a text box still means "undo what I just typed". The Edit-menu
 * accelerator fires whatever has focus, so the keystroke is handed back to the
 * focused field and the document is left alone. Clicking the toolbar button
 * moves focus to the button, so that path is never intercepted.
 */
function typingWasSteppedInstead(step: Step): boolean {
  const element = globalThis.document?.activeElement ?? null;
  if (element === null) return false;
  const isTextEntry =
    TEXT_ENTRY_TAGS.has(element.tagName) || element.getAttribute('contenteditable') === 'true';
  if (!isTextEntry) return false;
  globalThis.document.execCommand(step);
  return true;
}

/** Undo can take away the page the viewer is parked on. */
function keepPageInRange(pageCount: number): void {
  const store = useAppStore.getState();
  if (store.currentPage > pageCount) store.setCurrentPage(pageCount);
}

async function settle(step: Step, docId: string, applied: boolean): Promise<void> {
  const store = useAppStore.getState();
  if (!applied) {
    // The end of the history is a no-op, not a failure: say so and stop.
    store.setNotice(NOTHING[step]);
    return;
  }
  const session = await window.librarius.file.read(docId);
  store.replaceSession(session);
  keepPageInRange(session.pageCount);
  store.setNotice(DONE[step]);
}

/** Guards the toolbar button, the Edit menu, and the accelerator against each other. */
let stepIsRunning = false;

async function stepHistory(step: Step): Promise<void> {
  const store = useAppStore.getState();
  const docId = store.activeId;
  if (docId === null || stepIsRunning) return;
  if (typingWasSteppedInstead(step)) return;
  stepIsRunning = true;
  store.setBusy(BUSY[step]);
  store.setError(null);
  try {
    const bridge = window.librarius.file;
    const result = step === 'undo' ? await bridge.undo(docId) : await bridge.redo(docId);
    await settle(step, docId, result.applied);
  } catch (error) {
    store.setError(`${FAILED[step]} ${describe(error)}`);
  } finally {
    stepIsRunning = false;
    store.setBusy(null);
  }
}

export function undoActive(): Promise<void> {
  return stepHistory('undo');
}

export function redoActive(): Promise<void> {
  return stepHistory('redo');
}

/**
 * Reads what the Undo/Redo controls should enable. A document that has just
 * closed is the only realistic failure, and "both disabled" is the honest
 * answer to it — nothing the attorney could act on.
 */
export async function readUndoState(docId: string | null): Promise<UndoState> {
  if (docId === null) return NO_HISTORY;
  try {
    return await window.librarius.file.undoState(docId);
  } catch {
    return NO_HISTORY;
  }
}

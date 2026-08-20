/**
 * Mounting the redaction dialogs from outside React.
 *
 * The save flow is plain functions (src/app/document-actions.ts → save-gates.ts),
 * not a component, and the gate has to appear whichever tool panel happens to be
 * open — including none. So the dialog gets its own root on the document body,
 * created when it is needed and torn down when it is answered. This module is
 * loaded lazily by the gate, so an ordinary save with nothing marked never pulls
 * React DOM in for a dialog it will not raise.
 *
 * Same shape as the signature lane's flatten-confirm-host, on purpose: one
 * pattern for "the point of no return", one place to reason about it.
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ProgressEvent } from '@shared/types';
import { DestroyConfirm, RedactSaveGate, RedactWorking } from './redact-confirm';
import type { RedactionGateChoice } from './redact-consent';

const HOST_ID = 'redact-confirm';

interface OpenDialog {
  kind: 'destroy' | 'save-gate';
  count: number;
  pages: number;
  /** Non-null once the destruction is running: the dialog becomes the readout. */
  progress: ProgressEvent | null;
  working: boolean;
  answer(choice: RedactionGateChoice): void;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let open: OpenDialog | null = null;

function view(dialog: OpenDialog): ReturnType<typeof createElement> {
  if (dialog.working) return createElement(RedactWorking, { event: dialog.progress });
  if (dialog.kind === 'save-gate') {
    return createElement(RedactSaveGate, {
      count: dialog.count,
      pages: dialog.pages,
      onChoice: (choice: RedactionGateChoice) => dialog.answer(choice),
    });
  }
  return createElement(DestroyConfirm, {
    count: dialog.count,
    pages: dialog.pages,
    onConfirm: () => dialog.answer('apply'),
    onCancel: () => dialog.answer('cancel'),
  });
}

function draw(): void {
  if (root === null || open === null) return;
  root.render(view(open));
}

function mount(): void {
  if (host !== null) return;
  host = document.createElement('div');
  host.id = HOST_ID;
  document.body.append(host);
  root = createRoot(host);
}

function ask(kind: OpenDialog['kind'], count: number, pages: number): Promise<RedactionGateChoice> {
  mount();
  return new Promise<RedactionGateChoice>((resolve) => {
    open = {
      kind,
      count,
      pages,
      progress: null,
      working: false,
      answer: (choice) => {
        // Answered once: a second click on a stale render must not settle an
        // already-settled save a second time.
        if (open === null) return;
        open = { ...open, answer: () => undefined };
        resolve(choice);
        if (choice !== 'apply') closeRedactConfirm();
      },
    };
    draw();
  });
}

/** The panel's confirmation. True means destroy the marked content. */
export async function askToDestroy(count: number, pages: number): Promise<boolean> {
  const choice = await ask('destroy', count, pages);
  if (choice !== 'apply') return false;
  closeRedactConfirm();
  return true;
}

/** The save-time gate. Three answers, all of them explicit. */
export function askAtSave(count: number, pages: number): Promise<RedactionGateChoice> {
  return ask('save-gate', count, pages);
}

/** Turns the answered gate into a live progress readout while the run works. */
export function reportRedactProgress(progress: ProgressEvent | null): void {
  if (open === null) return;
  open = { ...open, progress, working: true };
  draw();
}

export function closeRedactConfirm(): void {
  open = null;
  const closing = root;
  const element = host;
  root = null;
  host = null;
  // Deferred: React refuses a synchronous unmount from inside the render it is
  // committing, which is exactly where a click handler that answers this runs.
  queueMicrotask(() => {
    closing?.unmount();
    element?.remove();
  });
}

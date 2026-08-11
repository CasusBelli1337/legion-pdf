/**
 * Mounting the flatten confirmation from outside React.
 *
 * The save flow is plain functions (src/app/document-actions.ts), not a
 * component, and the dialog has to appear whichever tool panel happens to be
 * open — including none. So the dialog gets its own root on the document body,
 * created when it is needed and torn down when it is answered. Nothing is
 * mounted, and React DOM is not even loaded, on a save that has no live
 * signatures to ask about.
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FlattenConfirm, type FlattenProgress } from './flatten-confirm';

const HOST_ID = 'signature-flatten-confirm';

interface OpenDialog {
  count: number;
  progress: FlattenProgress | null;
  answer(confirmed: boolean): void;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let open: OpenDialog | null = null;

function draw(): void {
  if (root === null || open === null) return;
  const dialog = open;
  root.render(
    createElement(FlattenConfirm, {
      count: dialog.count,
      progress: dialog.progress,
      onConfirm: () => dialog.answer(true),
      onCancel: () => dialog.answer(false),
    })
  );
}

function mount(): void {
  if (host !== null) return;
  host = document.createElement('div');
  host.id = HOST_ID;
  document.body.append(host);
  root = createRoot(host);
}

/** Raises the dialog. Resolves true when the attorney agrees to flatten. */
export function askToFlatten(count: number): Promise<boolean> {
  mount();
  return new Promise<boolean>((resolve) => {
    open = {
      count,
      progress: null,
      answer: (confirmed) => {
        // Answered once: the progress view replaces the buttons, and a second
        // click on a stale render must not resolve an already-settled save.
        if (open === null) return;
        open = { ...open, answer: () => undefined };
        resolve(confirmed);
        if (!confirmed) closeFlattenModal();
      },
    };
    draw();
  });
}

/** Live count while the signatures are written. No-op once the dialog is gone. */
export function reportFlattenProgress(current: number, total: number): void {
  if (open === null) return;
  open = { ...open, progress: { current, total } };
  draw();
}

export function closeFlattenModal(): void {
  open = null;
  const closing = root;
  const element = host;
  root = null;
  host = null;
  // Unmounting is deferred: React refuses a synchronous unmount from inside the
  // render it is currently committing, which is exactly where a click handler
  // that resolves the dialog runs.
  queueMicrotask(() => {
    closing?.unmount();
    element?.remove();
  });
}

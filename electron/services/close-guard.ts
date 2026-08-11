/**
 * The unsaved-work gate: everything that decides whether an attorney's edits
 * may leave this app, and every word the prompt says.
 *
 * The prompt is NATIVE (dialog.showMessageBox, main process) rather than
 * window.confirm — a renderer-side confirm blocks the renderer thread, freezes
 * the viewer behind the prompt, and wedges the app under automation. Only the
 * decision lives here, with no Electron import, so the one place in this app
 * that can lose a day's work is unit-tested branch by branch.
 */

import type { CloseChoice } from '@shared/types';

/** Structurally an Electron MessageBoxOptions, declared here to stay pure. */
export interface ConfirmPrompt {
  type: 'warning';
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
  noLink: true;
}

/** Button order, and therefore the meaning of the index the dialog answers. */
const CHOICES: readonly CloseChoice[] = ['save', 'discard', 'cancel'];

/** An index outside the buttons cancels: a stray answer never discards work. */
export function choiceOf(buttonIndex: number): CloseChoice {
  return CHOICES[buttonIndex] ?? 'cancel';
}

function promptFor(
  message: string,
  detail: string,
  [saveLabel, discardLabel]: [string, string]
): ConfirmPrompt {
  return {
    type: 'warning',
    title: 'Unsaved changes',
    message,
    detail,
    buttons: [saveLabel, discardLabel, 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
}

/** What the attorney is asked when a tab with edits in it is closed. */
export function closePrompt(fileName: string): ConfirmPrompt {
  return promptFor(
    `Save your changes to ${fileName}?`,
    'If you close without saving, the work you have done on this document is gone for good.',
    ['Save and close', 'Close without saving']
  );
}

/** The same question at quit, summarised when more than one document is open. */
export function quitPrompt(fileNames: readonly string[]): ConfirmPrompt {
  const only = fileNames.length === 1 ? fileNames[0] : undefined;
  if (only !== undefined) {
    return promptFor(
      `Save your changes to ${only}?`,
      'If you quit without saving, the work you have done on this document is gone for good.',
      ['Save and quit', 'Quit without saving']
    );
  }
  return promptFor(
    `${fileNames.length} documents have unsaved changes.`,
    `${fileNames.join('\n')}\n\nIf you quit without saving, the work you have done on these ` +
      'documents is gone for good.',
    ['Save all and quit', 'Quit without saving']
  );
}

/** One open document with edits that are not on disk yet. */
export interface UnsavedDocument {
  id: string;
  fileName: string;
  /** null = never written to disk, so saving it has to ask for a location. */
  filePath: string | null;
}

export interface QuitGuardDeps {
  dirtyDocuments(): UnsavedDocument[];
  /** Raises the native prompt; resolves the index of the button pressed. */
  ask(prompt: ConfirmPrompt): Promise<number>;
  save(docId: string): Promise<void>;
  /** Save As. Resolves false when the attorney cancels the location dialog. */
  saveAs(docId: string): Promise<boolean>;
}

async function saveOne(deps: QuitGuardDeps, document: UnsavedDocument): Promise<boolean> {
  if (document.filePath === null) return deps.saveAs(document.id);
  await deps.save(document.id);
  return true;
}

/**
 * True = go ahead and quit. False = the attorney backed out and nothing was
 * lost. Cancelling the Save As dialog for any one document cancels the quit,
 * and the documents behind it are left alone rather than half-saved.
 */
export async function resolveQuit(deps: QuitGuardDeps): Promise<boolean> {
  const dirty = deps.dirtyDocuments();
  if (dirty.length === 0) return true;

  const choice = choiceOf(await deps.ask(quitPrompt(dirty.map((document) => document.fileName))));
  if (choice !== 'save') return choice === 'discard';

  for (const document of dirty) {
    if (!(await saveOne(deps, document))) return false;
  }
  return true;
}

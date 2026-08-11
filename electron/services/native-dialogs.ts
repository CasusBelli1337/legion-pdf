/**
 * Every OS dialog this app raises, in one place. Save As is shared by the
 * `file:saveAs` handler and the unsaved-work guard, so "Save and close" on a
 * document that has never been written to disk asks for a location exactly the
 * way the File menu does — one dialog, one behaviour, one place to change it.
 */

import { dialog } from 'electron';
import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from 'electron';
import type { SaveResult } from '@shared/types';
import type { ConfirmPrompt } from './close-guard';
import type { DocStore } from './doc-store';

const PDF_FILTER = [{ name: 'PDF documents', extensions: ['pdf'] }];

/** The chosen absolute paths, or an empty array when the picker is cancelled. */
export async function openPdfDialog(window: BrowserWindow | null): Promise<string[]> {
  const options: OpenDialogOptions = {
    title: 'Open PDF',
    filters: PDF_FILTER,
    properties: ['openFile', 'multiSelections'],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

/** Resolves null when the attorney cancels — a cancel is never a silent save. */
export async function saveAsWithDialog(
  store: DocStore,
  window: BrowserWindow | null,
  docId: string,
  suggestedName?: string
): Promise<SaveResult | null> {
  const options: SaveDialogOptions = {
    title: 'Save PDF As',
    defaultPath: suggestedName ?? store.session(docId).fileName,
    filters: PDF_FILTER,
  };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || result.filePath === undefined) return null;
  return store.saveTo(docId, result.filePath);
}

/** Raises a ConfirmPrompt and answers with the index of the button pressed. */
export async function askConfirm(
  window: BrowserWindow | null,
  prompt: ConfirmPrompt
): Promise<number> {
  const result = window
    ? await dialog.showMessageBox(window, prompt)
    : await dialog.showMessageBox(prompt);
  return result.response;
}

/** A save that failed on the way out. Loud, never a silent close. */
export function showSaveFailure(message: string): void {
  dialog.showErrorBox(
    'Could not save',
    `${message}\n\nLibrarius has left the document open so nothing is lost.`
  );
}

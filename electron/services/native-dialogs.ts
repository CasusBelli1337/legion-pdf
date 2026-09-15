/**
 * Every OS dialog this app raises, in one place. Save As is shared by the
 * `file:saveAs` handler and the unsaved-work guard, so "Save and close" on a
 * document that has never been written to disk asks for a location exactly the
 * way the File menu does — one dialog, one behaviour, one place to change it.
 */

import { dialog } from 'electron';
import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { exportFormatInfo } from '@shared/export-formats';
import type { ExportFormat, SaveResult } from '@shared/types';
import type { ConfirmPrompt } from './close-guard';
import type { DocStore } from './doc-store';
import {
  IMAGE_EXTENSIONS,
  OPENABLE_EXTENSIONS,
  PRESENTATION_EXTENSIONS,
  SPREADSHEET_EXTENSIONS,
  TEXT_EXTENSIONS,
  WORD_EXTENSIONS,
} from '@shared/convert-inputs';
import { PRODUCT_NAME } from '@shared/product';

const PDF_FILTER = [{ name: 'PDF documents', extensions: ['pdf'] }];

/** Windows dialogs want extensions without the dot; the shared lists carry it. */
function bare(extensions: readonly string[]): string[] {
  return extensions.map((extension) => extension.replace(/^\./, ''));
}

/**
 * Open accepts everything Legion PDF can turn into a PDF, not only PDFs — the
 * conversion happens inside `file:open`. "All supported files" is first so the
 * attorney sees their Word documents and scans without changing the filter, and
 * every group below it comes from shared/convert-inputs.ts, the one list.
 */
const OPEN_FILTERS = [
  { name: 'All supported files', extensions: bare(OPENABLE_EXTENSIONS) },
  ...PDF_FILTER,
  { name: 'Word documents', extensions: bare(WORD_EXTENSIONS) },
  { name: 'Images', extensions: bare(IMAGE_EXTENSIONS) },
  {
    name: 'Spreadsheets and presentations',
    extensions: bare([...SPREADSHEET_EXTENSIONS, ...PRESENTATION_EXTENSIONS]),
  },
  { name: 'Text and web pages', extensions: bare(TEXT_EXTENSIONS) },
];

/** The chosen absolute paths, or an empty array when the picker is cancelled. */
export async function openPdfDialog(window: BrowserWindow | null): Promise<string[]> {
  const options: OpenDialogOptions = {
    title: 'Open',
    filters: OPEN_FILTERS,
    properties: ['openFile', 'multiSelections'],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

/** The folder a batch of output files is written into. Null when cancelled. */
export async function chooseFolderDialog(
  window: BrowserWindow | null,
  title = 'Choose a folder for the finished files'
): Promise<string | null> {
  const options: OpenDialogOptions = {
    title,
    buttonLabel: 'Use this folder',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
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

/**
 * Where an export goes. Per-page formats need a FOLDER (the app names the files
 * itself, one per page); single-file formats get a save dialog filtered to that
 * format's extension. Null whenever the attorney backs out.
 */
export async function chooseExportOutput(
  window: BrowserWindow | null,
  format: ExportFormat,
  suggestedName: string
): Promise<string | null> {
  const info = exportFormatInfo(format);
  if (info.output === 'folder') {
    return chooseFolderDialog(window, 'Choose a folder for the exported pages');
  }
  const options: SaveDialogOptions = {
    title: `Export as ${info.label}`,
    defaultPath: suggestedName,
    filters: [{ name: info.label, extensions: [info.extension] }],
  };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || result.filePath === undefined) return null;
  return result.filePath;
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
    `${message}\n\n${PRODUCT_NAME} has left the document open so nothing is lost.`
  );
}

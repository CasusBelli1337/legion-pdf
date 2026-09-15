/**
 * What the Combine Files panel's buttons actually do. Plain functions against
 * the two stores rather than hooks, so Explorer's Combine verb (which arrives
 * at module scope in src/main.tsx, before React has mounted anything) and the
 * panel's own buttons share exactly one implementation.
 */

import { IPC } from '@shared/ipc';
import type { ProgressEvent } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { openNewDocuments } from '@renderer/features/organize/new-documents';
import { fileNameOf } from './combine-list';
import { plainError } from './combine-messages';
import { useCombineStore } from './combine-store';

const TOOL_ID = 'combine';

/**
 * Explorer's "Combine in Legion PDF" landed. The files go in the list and the
 * dock opens on the panel, so the attorney sees what he right-clicked rather
 * than an app that merely came to the front.
 */
export function queueCombineFiles(paths: readonly string[]): void {
  if (paths.length === 0) return;
  useCombineStore.getState().addPaths(paths);
  useAppStore.getState().setActiveTool(TOOL_ID);
}

export async function addFilesFromDialog(): Promise<void> {
  try {
    useCombineStore.getState().addPaths(await window.librarius.file.openDialog());
  } catch (error) {
    useCombineStore.getState().fail(`Could not open the file picker: ${plainError(error)}`);
  }
}

/** The documents already open in tabs, in tab order. */
export function addOpenDocuments(): void {
  const sessions = useAppStore.getState().sessions;
  if (sessions.length === 0) {
    useCombineStore.getState().note('No documents are open yet.');
    return;
  }
  useCombineStore.getState().addSessions(sessions);
}

/**
 * Both channels: `ops:merge` streams its own page counts, and a Word document
 * or image in the list is converted on the way in (convert lane), which streams
 * separately. Watching only one leaves the bar frozen through the other.
 */
function watchProgress(): () => void {
  const onEvent = (event: ProgressEvent): void => {
    // A null id is a document being BUILT — this combine, by definition.
    if (event.docId === null) useCombineStore.getState().setProgress(event);
  };
  const stopOps = window.librarius.onProgress(IPC.ops.progress, onEvent);
  const stopConvert = window.librarius.onProgress(IPC.convert.progress, onEvent);
  return () => {
    stopOps();
    stopConvert();
  };
}

export async function runCombine(): Promise<void> {
  const entries = useCombineStore.getState().entries;
  if (entries.length < 2) return;
  const label = `Combining ${entries.length} files`;
  useCombineStore.getState().begin(label);
  useAppStore.getState().setBusy(label);
  const stopProgress = watchProgress();
  try {
    const result = await window.librarius.ops.merge({
      sources: entries.map((entry) => entry.source),
      preserveBookmarks: true,
    });
    // Never take a combine's word for it: an empty result is a failure, not a
    // document (no silent data loss).
    if (result.pagesOut < 1) throw new Error('The combined document came back empty.');
    await openNewDocuments([result.detail.docId]);
    const message = `Combined ${entries.length} files into one ${result.pagesOut}-page document.`;
    useCombineStore.getState().finish({ docId: result.detail.docId, message });
    useAppStore.getState().setNotice(message, result.detail.docId);
  } catch (error) {
    const message = plainError(error);
    useCombineStore.getState().fail(message);
    useAppStore.getState().setError(`Could not combine those files: ${message}`, null);
  } finally {
    stopProgress();
    useAppStore.getState().setBusy(null);
  }
}

/** Save As on the combined document — it exists only in memory until this. */
export async function saveCombined(docId: string): Promise<void> {
  try {
    const saved = await window.librarius.file.saveAs(docId, 'Combined.pdf');
    if (saved === null) return;
    useAppStore.getState().replaceSession(await window.librarius.file.read(docId));
    const message = `Saved as ${fileNameOf(saved.filePath)}.`;
    useCombineStore.getState().note(message);
    useAppStore.getState().setNotice(message, docId);
  } catch (error) {
    useCombineStore.getState().fail(`Could not save a copy: ${plainError(error)}`);
  }
}

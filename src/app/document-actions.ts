/**
 * Every document action the shell can trigger, in one place. Written as plain
 * functions against the store rather than hooks so menu handlers, keyboard
 * shortcuts, and buttons all share exactly one implementation.
 */

import type { CloseChoice, DocumentSession } from '@shared/types';
import { finishPrint, forgetTabView, preparePrint } from '../components/viewer';
// Work that lives in the renderer and is not in the file yet — placed
// signatures, redaction marks — is settled by the save gates before any write.
import { hasLiveSignatures } from '../features/signature/save-flattening';
import { hasPendingMarks } from '../features/redact/redaction-store';
import { runSaveGates } from './save-gates';
import { useAppStore } from './store';
import { PRODUCT_NAME } from '@shared/product';

/** Plain English for the attorney, never a stack trace. */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}

/** `docId` scopes the message; omit it for the document in front, null for the app. */
function report(prefix: string, error: unknown, docId?: string | null): void {
  useAppStore.getState().setError(`${prefix} ${describe(error)}`, docId);
}

/** Guards against the menu accelerator and the Ctrl+O key handler both firing. */
let dialogIsOpen = false;

export async function openDialog(): Promise<void> {
  if (dialogIsOpen) return;
  dialogIsOpen = true;
  try {
    const paths = await window.librarius.file.openDialog();
    if (paths.length > 0) await openPaths(paths);
  } catch (error) {
    report('Could not open the file picker:', error, null);
  } finally {
    dialogIsOpen = false;
  }
}

/** False when a path could not be opened — the recent list uses that to react. */
export async function openPaths(paths: string[]): Promise<boolean> {
  const store = useAppStore.getState();
  store.setError(null);
  try {
    for (const [index, path] of paths.entries()) {
      store.setBusy(`Opening ${index + 1} of ${paths.length}`);
      store.openSession(await window.librarius.file.open(path));
    }
    return true;
  } catch (error) {
    // The file that would not open is not a tab, so this belongs to no document.
    report('Could not open that PDF:', error, null);
    return false;
  } finally {
    store.setBusy(null);
  }
}

function activeId(): string | null {
  return useAppStore.getState().activeId;
}

export async function saveActive(): Promise<void> {
  const docId = activeId();
  if (docId === null) return;
  if (!(await runSaveGates(docId))) return;
  const store = useAppStore.getState();
  store.setBusy('Saving');
  try {
    await window.librarius.file.save(docId);
    store.replaceSession(await window.librarius.file.read(docId));
    store.setError(null);
  } catch (error) {
    report('Could not save:', error);
  } finally {
    store.setBusy(null);
  }
}

export async function saveActiveAs(): Promise<void> {
  const docId = activeId();
  if (docId === null) return;
  if (!(await runSaveGates(docId))) return;
  const store = useAppStore.getState();
  store.setBusy('Saving a copy');
  try {
    const result = await window.librarius.file.saveAs(docId);
    if (result !== null) store.replaceSession(await window.librarius.file.read(docId));
    store.setError(null);
  } catch (error) {
    report('Could not save a copy:', error);
  } finally {
    store.setBusy(null);
  }
}

/**
 * Guards the toolbar button, the File menu, and the Ctrl+P accelerator against
 * each other. A second print while one is preparing would bump the sheet's
 * generation and abort BOTH runs, so the attorney would get an error instead of
 * a print dialog.
 */
let printIsRunning = false;

export async function printActive(): Promise<void> {
  const docId = activeId();
  if (docId === null || printIsRunning) return;
  printIsRunning = true;
  try {
    // Chromium prints the DOM, and the viewer only holds the pages on screen,
    // so every page is rendered into a hidden print sheet first.
    await preparePrint(docId);
    await window.librarius.app.print(docId);
  } catch (error) {
    report('Could not print:', error);
  } finally {
    // Always: a half-built sheet holds a blob URL per page until it is dropped.
    finishPrint();
    printIsRunning = false;
  }
}

async function releaseSession(docId: string): Promise<void> {
  try {
    await window.librarius.file.close(docId);
  } catch (error) {
    report('Could not close that document:', error);
  } finally {
    forgetTabView(docId);
    useAppStore.getState().closeSession(docId);
  }
}

/** True once the work is on disk. False means the attorney backed out of Save As. */
async function saveBeforeClosing(session: DocumentSession): Promise<boolean> {
  if (!(await runSaveGates(session.id))) return false;
  const store = useAppStore.getState();
  store.setBusy('Saving');
  try {
    if (session.filePath === null) {
      return (await window.librarius.file.saveAs(session.id)) !== null;
    }
    await window.librarius.file.save(session.id);
    return true;
  } catch (error) {
    report('Could not save:', error);
    return false;
  } finally {
    store.setBusy(null);
  }
}

async function clearedToClose(session: DocumentSession): Promise<boolean> {
  let choice: CloseChoice;
  try {
    choice = await window.librarius.app.confirmClose(session.fileName);
  } catch (error) {
    // A prompt that could not be raised is never taken as permission to discard.
    report('Could not ask about the unsaved changes:', error);
    return false;
  }
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  return saveBeforeClosing(session);
}

/**
 * F-4: a tab with unsaved work never disappears on a mis-click. The choice is
 * raised natively by the main process, and cancelling the Save As dialog that
 * "Save and close" opens cancels the close with it.
 */
export async function closeDocument(docId: string): Promise<void> {
  const session = useAppStore.getState().sessions.find((item) => item.id === docId);
  if (session === undefined) return;
  // Live signatures and redaction marks are unsaved work the dirty flag cannot
  // see: they live in the renderer, so the main-process byte store is still
  // clean. Without them in the guard a signed-but-unsaved tab, or one carrying
  // marks the attorney spent an afternoon drawing, would close silently.
  const unsaved = session.dirty || hasLiveSignatures(docId) || hasPendingMarks(docId);
  if (unsaved && !(await clearedToClose(session))) return;
  await releaseSession(docId);
}

export async function showVersion(): Promise<void> {
  try {
    const version = await window.librarius.app.version();
    // About the app, not about a document: it stays put across a tab switch.
    useAppStore
      .getState()
      .setNotice(`${PRODUCT_NAME} ${version.app} - Electron ${version.electron}`, null);
  } catch (error) {
    report('Could not read the version:', error);
  }
}

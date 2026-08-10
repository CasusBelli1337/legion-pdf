/**
 * Every document action the shell can trigger, in one place. Written as plain
 * functions against the store rather than hooks so menu handlers, keyboard
 * shortcuts, and buttons all share exactly one implementation.
 */

import { finishPrint, forgetTabView, preparePrint } from '../components/viewer';
import { useAppStore } from './store';

/** Plain English for the attorney, never a stack trace. */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}

function report(prefix: string, error: unknown): void {
  useAppStore.getState().setError(`${prefix} ${describe(error)}`);
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
    report('Could not open the file picker:', error);
  } finally {
    dialogIsOpen = false;
  }
}

export async function openPaths(paths: string[]): Promise<void> {
  const store = useAppStore.getState();
  store.setError(null);
  try {
    for (const [index, path] of paths.entries()) {
      store.setBusy(`Opening ${index + 1} of ${paths.length}`);
      store.openSession(await window.librarius.file.open(path));
    }
  } catch (error) {
    report('Could not open that PDF:', error);
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

export async function printActive(): Promise<void> {
  const docId = activeId();
  if (docId === null) return;
  try {
    // Chromium prints the DOM, and the viewer only holds the pages on screen,
    // so every page is rendered into a hidden print sheet first.
    await preparePrint(docId);
    await window.librarius.app.print(docId);
  } catch (error) {
    report('Could not print:', error);
  } finally {
    finishPrint();
  }
}

export async function closeDocument(docId: string): Promise<void> {
  try {
    await window.librarius.file.close(docId);
  } catch (error) {
    report('Could not close that document:', error);
  } finally {
    forgetTabView(docId);
    useAppStore.getState().closeSession(docId);
  }
}

export async function showVersion(): Promise<void> {
  try {
    const version = await window.librarius.app.version();
    useAppStore.getState().setNotice(`Librarius ${version.app} - Electron ${version.electron}`);
  } catch (error) {
    report('Could not read the version:', error);
  }
}

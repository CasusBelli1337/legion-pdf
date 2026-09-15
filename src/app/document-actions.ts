/**
 * Every document action the shell can trigger, in one place. Written as plain
 * functions against the store rather than hooks so menu handlers, keyboard
 * shortcuts, and buttons all share exactly one implementation.
 */

import type { CloseChoice, DocumentSession } from '@shared/types';
import { finishPrint, forgetTabView, preparePrint } from '../components/viewer';
// Work that lives in the renderer and is not in the file yet — typed form
// answers, placed signatures, redaction marks — is settled by the save gates
// before any write.
import { commitFormValuesFor } from '../features/forms/save-filling';
import { hasPendingFormEdits } from '../features/forms/form-store';
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

/**
 * Windows paths: case does not distinguish two files, and either slash reaches
 * the same one. Comparing the raw strings would open `C:\Matters\Dep.pdf` a
 * second time because Explorer sent it as `C:/Matters/dep.pdf`.
 */
function samePath(left: string, right: string): boolean {
  const flatten = (path: string): string => path.replace(/\\/g, '/').toLowerCase();
  return flatten(left) === flatten(right);
}

export interface OpenDecision {
  /** Paths that still have to be read off disk, in the order they were given. */
  toOpen: string[];
  /** The tab to bring forward when everything asked for is already open. */
  focusId: string | null;
}

/**
 * Which of these files are already open. A second tab on the same file is two
 * tabs with the SAME NAME and two independent copies of the bytes: an edit
 * lands in one of them, the other still shows the old page, and neither tab
 * says which is which. So a path already open is brought forward rather than
 * opened again — the behaviour every editor with tabs has.
 */
export function decideOpen(
  paths: readonly string[],
  open: ReadonlyArray<Pick<DocumentSession, 'id' | 'filePath'>>
): OpenDecision {
  const existing = (path: string): string | null =>
    open.find((item) => item.filePath !== null && samePath(item.filePath, path))?.id ?? null;
  const toOpen = paths.filter((path) => existing(path) === null);
  // The LAST path asked for is the one the attorney expects to be looking at.
  const alreadyOpen = paths.map(existing).filter((id): id is string => id !== null);
  return { toOpen, focusId: alreadyOpen.at(-1) ?? null };
}

/** False when a path could not be opened — the recent list uses that to react. */
export async function openPaths(paths: string[]): Promise<boolean> {
  const store = useAppStore.getState();
  store.setError(null);
  const { toOpen, focusId } = decideOpen(paths, store.sessions);
  try {
    for (const [index, path] of toOpen.entries()) {
      store.setBusy(`Opening ${index + 1} of ${toOpen.length}`);
      store.openSession(await window.librarius.file.open(path));
    }
    // Nothing new to read: say so, rather than looking like the click did nothing.
    if (toOpen.length === 0 && focusId !== null) {
      store.setActive(focusId);
      store.setNotice('That PDF is already open.', focusId);
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

/**
 * File > Create PDF from File... — the Open dialog, which accepts every file
 * type Legion PDF can turn into a PDF. The conversion happens inside
 * `file:open` (convert lane), so a chosen .docx arrives as an unsaved PDF tab.
 */
export async function createPdfFromFiles(): Promise<void> {
  await openDialog();
}

/** File > Combine Files... opens the Combine Files tool in the dock. */
export function combineFiles(): void {
  useAppStore.getState().setActiveTool('combine');
}

/** File > Export As... opens the Export tool for the document in front. */
export function exportActive(): void {
  if (activeId() === null) return;
  useAppStore.getState().setActiveTool('export');
}

export async function saveActive(): Promise<void> {
  const docId = activeId();
  if (docId === null) return;
  // A combined, extracted, or converted document has no file yet: Save IS Save As.
  const session = useAppStore.getState().sessions.find((item) => item.id === docId);
  if (session?.filePath === null) return saveActiveAs();
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
    // Typed form answers live in the renderer; the print sheet renders from
    // the bytes. Committing first is what makes the paper match the screen.
    if (!(await commitFormValuesFor(docId))) return;
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
  // Typed form answers, live signatures and redaction marks are unsaved work
  // the dirty flag cannot see: they live in the renderer, so the main-process
  // byte store is still clean. Without them in the guard a filled-but-unsaved
  // court form, a signed tab, or one carrying marks the attorney spent an
  // afternoon drawing, would close silently.
  const unsaved =
    session.dirty ||
    hasPendingFormEdits(docId) ||
    hasLiveSignatures(docId) ||
    hasPendingMarks(docId);
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

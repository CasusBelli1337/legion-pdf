// #seam:ipc-contract
/**
 * file:* handlers — open dialog, read, save, save as, recent list, close,
 * undo/redo. Fully implemented; the viewer lane consumes these, it does not
 * replace them. The dialogs themselves live in services/native-dialogs so the
 * unsaved-work guard raises the very same Save As.
 */

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { DocumentSession, SaveResult, UndoResult, UndoState } from '@shared/types';
import { chooseFolderDialog, openPdfDialog, saveAsWithDialog } from '../services/native-dialogs';
import type { IpcContext } from './context';

export function registerFileHandlers(context: IpcContext): void {
  registerOpenHandlers(context);
  registerSaveHandlers(context);
  registerRecentHandlers(context);
  registerHistoryHandlers(context);
}

/**
 * The history lives in the doc store, alongside the bytes it steps between, so
 * these three are pass-throughs. `applied: false` is an honest no-op answer —
 * the end of the history is not a failure — and the state fields always
 * describe the document as it stands AFTER the call. An applied step also
 * carries the `tag` of the change it stepped over, straight from the store, so
 * the renderer can roll its own state back with the bytes.
 */
function registerHistoryHandlers({ store }: IpcContext): void {
  ipcMain.handle(IPC.file.undo, (_event, docId: string): Promise<UndoResult> => {
    return store.undo(docId);
  });

  ipcMain.handle(IPC.file.redo, (_event, docId: string): Promise<UndoResult> => {
    return store.redo(docId);
  });

  ipcMain.handle(IPC.file.undoState, (_event, docId: string): UndoState => {
    return store.undoState(docId);
  });
}

function registerOpenHandlers({ store, getWindow }: IpcContext): void {
  ipcMain.handle(IPC.file.openDialog, (): Promise<string[]> => openPdfDialog(getWindow()));

  ipcMain.handle(IPC.file.open, (_event, filePath: string): Promise<DocumentSession> => {
    return store.openFile(filePath);
  });

  ipcMain.handle(IPC.file.read, (_event, docId: string): DocumentSession => {
    return store.session(docId);
  });

  ipcMain.handle(IPC.file.close, (_event, docId: string): void => {
    store.close(docId);
  });
}

function registerSaveHandlers({ store, getWindow }: IpcContext): void {
  ipcMain.handle(IPC.file.save, (_event, docId: string): Promise<SaveResult> => {
    return store.save(docId);
  });

  ipcMain.handle(
    IPC.file.saveAs,
    (_event, docId: string, suggestedName?: string): Promise<SaveResult | null> => {
      return saveAsWithDialog(store, getWindow(), docId, suggestedName);
    }
  );

  // Save As with the path already decided. The store does the same atomic write
  // the dialog path does, so a scripted save is never the weaker one.
  ipcMain.handle(
    IPC.file.saveTo,
    (_event, docId: string, targetPath: string): Promise<SaveResult> => {
      if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
        throw new Error('Cannot save: no file name was given.');
      }
      return store.saveTo(docId, targetPath);
    }
  );

  ipcMain.handle(IPC.file.chooseFolder, (): Promise<string | null> => {
    return chooseFolderDialog(getWindow());
  });
}

function registerRecentHandlers({ store }: IpcContext): void {
  ipcMain.handle(IPC.file.recent, () => store.recent());
  ipcMain.handle(IPC.file.recentClear, () => store.clearRecent());
}

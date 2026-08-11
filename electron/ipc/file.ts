// #seam:ipc-contract
/**
 * file:* handlers — open dialog, read, save, save as, recent list, close.
 * Fully implemented; the viewer lane consumes these, it does not replace them.
 * The dialogs themselves live in services/native-dialogs so the unsaved-work
 * guard raises the very same Save As.
 */

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { DocumentSession, SaveResult } from '@shared/types';
import { openPdfDialog, saveAsWithDialog } from '../services/native-dialogs';
import type { IpcContext } from './context';

export function registerFileHandlers(context: IpcContext): void {
  registerOpenHandlers(context);
  registerSaveHandlers(context);
  registerRecentHandlers(context);
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
}

function registerRecentHandlers({ store }: IpcContext): void {
  ipcMain.handle(IPC.file.recent, () => store.recent());
  ipcMain.handle(IPC.file.recentClear, () => store.clearRecent());
}

// #seam:ipc-contract
/**
 * file:* handlers — open dialog, read, save, save as, recent list, close.
 * Fully implemented; the viewer lane consumes these, it does not replace them.
 */

import { dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { IPC } from '@shared/ipc';
import type { DocumentSession, SaveResult } from '@shared/types';
import type { IpcContext } from './context';

const PDF_FILTER = [{ name: 'PDF documents', extensions: ['pdf'] }];

export function registerFileHandlers(context: IpcContext): void {
  registerOpenHandlers(context);
  registerSaveHandlers(context);
  registerRecentHandlers(context);
}

function registerOpenHandlers({ store, getWindow }: IpcContext): void {
  ipcMain.handle(IPC.file.openDialog, async (): Promise<string[]> => {
    const window = getWindow();
    const options: OpenDialogOptions = {
      title: 'Open PDF',
      filters: PDF_FILTER,
      properties: ['openFile', 'multiSelections'],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

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
    async (_event, docId: string, suggestedName?: string): Promise<SaveResult | null> => {
      const window = getWindow();
      const defaultPath = suggestedName ?? store.session(docId).fileName;
      const options = { title: 'Save PDF As', defaultPath, filters: PDF_FILTER };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || result.filePath === undefined) return null;
      return store.saveTo(docId, result.filePath);
    }
  );
}

function registerRecentHandlers({ store }: IpcContext): void {
  ipcMain.handle(IPC.file.recent, () => store.recent());
  ipcMain.handle(IPC.file.recentClear, () => store.clearRecent());
}

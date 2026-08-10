// #seam:ipc-contract
/**
 * app:* handlers — print, reveal a path in the OS, version readout.
 * The `app:menu` channel is a push, emitted from electron/menu.ts.
 */

import { app, ipcMain, shell } from 'electron';
import { IPC } from '@shared/ipc';
import type { AppVersionInfo } from '@shared/types';
import type { IpcContext } from './context';

export function registerAppHandlers({ getWindow }: IpcContext): void {
  ipcMain.handle(IPC.app.print, async (): Promise<void> => {
    const window = getWindow();
    if (window === null) return;
    await new Promise<void>((resolve, reject) => {
      window.webContents.print({ silent: false }, (success, failureReason) => {
        // A user-cancelled print is a normal outcome, not an error.
        if (success || failureReason === 'cancelled') resolve();
        else reject(new Error(failureReason));
      });
    });
  });

  ipcMain.handle(IPC.app.openPath, async (_event, target: string): Promise<void> => {
    const failure = await shell.openPath(target);
    if (failure !== '') throw new Error(failure);
  });

  ipcMain.handle(IPC.app.version, (): AppVersionInfo => ({
    app: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node,
  }));
}

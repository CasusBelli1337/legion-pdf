/**
 * Placeholder registration for lanes that have not landed yet. Every stub
 * rejects loudly with the channel name so a half-wired UI can never look like
 * a working one.
 */

import { ipcMain } from 'electron';
import type { InvokeChannel } from '@shared/ipc';

export function registerNotImplemented(channels: readonly InvokeChannel[]): void {
  for (const channel of channels) {
    ipcMain.handle(channel, () => {
      throw new Error(`NotImplemented: ${channel}`);
    });
  }
}

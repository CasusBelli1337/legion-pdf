// #seam:ipc-contract
/**
 * LANE B (core ops) — owned by the ops agent.
 * Foundation ships the registration seam only. Replace the body of
 * registerOpsHandlers with real `ipcMain.handle` calls that delegate to
 * core/ops/**; leave the export name and signature alone.
 */

import { invokeChannelsOf } from '@shared/ipc';
import type { IpcContext } from './context';
import { registerNotImplemented } from './not-implemented';

export function registerOpsHandlers(_context: IpcContext): void {
  registerNotImplemented(invokeChannelsOf('ops'));
}

// #seam:ipc-contract
/**
 * The registration seam. Every handler module in this directory is wired up
 * here and nowhere else — one entry per build lane, so a lane owns its file
 * outright and never edits another's.
 */

import { registerAiHandlers } from './ai';
import { registerAppHandlers } from './app';
import { registerFileHandlers } from './file';
import { registerOcrHandlers } from './ocr';
import { registerOpsHandlers } from './ops';
import { registerRedactHandlers } from './redact';
import { registerStampHandlers } from './stamp';
import type { IpcContext } from './context';

export type { IpcContext } from './context';

export function registerIpcHandlers(context: IpcContext): void {
  registerFileHandlers(context);
  registerOpsHandlers(context);
  registerStampHandlers(context);
  registerOcrHandlers(context);
  registerRedactHandlers(context);
  registerAiHandlers(context);
  registerAppHandlers(context);
}

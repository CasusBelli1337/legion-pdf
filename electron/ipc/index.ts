// #seam:ipc-contract
/**
 * The registration seam. Every handler module in this directory is wired up
 * here and nowhere else — one entry per build lane, so a lane owns its file
 * outright and never edits another's.
 */

import { invokeChannelsOf } from '@shared/ipc';
import { registerAiHandlers } from './ai';
import { registerAppHandlers } from './app';
import { registerConvertHandlers } from './convert';
import { registerEsignHandlers } from './esign';
import { registerFileHandlers } from './file';
import { registerNotImplemented } from './not-implemented';
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
  registerEsignHandlers(context);
  registerAppHandlers(context);
  registerConvertHandlers(context);
  // Lanes in flight (2026-09-15 wave): each replaces its own line with its
  // real registration and touches no other.
  registerNotImplemented(invokeChannelsOf('export'));
  registerNotImplemented(invokeChannelsOf('edit'));
}

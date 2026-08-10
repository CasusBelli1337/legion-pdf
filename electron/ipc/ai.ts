// #seam:ipc-contract
/**
 * LANE F (Centurion) - owned by the AI agent.
 * The API key lives in safeStorage in this process and never leaves it: the
 * renderer only ever learns `hasKey`. Every answer checks `stop_reason`; a
 * `max_tokens` stop is a failure to retry, never a result to display.
 */

import { join } from 'node:path';
import { app, ipcMain, safeStorage } from 'electron';
import { IPC } from '@shared/ipc';
import type { AiAskRequest, AiAskResult, AiChunk, AiKeyStatus } from '@shared/types';
import { CenturionError, CenturionService, readAskPayload } from '../services/anthropic';
import { Keystore, KeystoreError } from '../services/keystore';
import type { IpcContext } from './context';

/** Ciphertext only. Named for the panel so it is obvious what it belongs to. */
const KEY_FILE_NAME = 'centurion-key.dat';

export function registerAiHandlers(context: IpcContext): void {
  const keystore = new Keystore({
    keyFilePath: join(app.getPath('userData'), KEY_FILE_NAME),
    safeStorage,
  });
  registerKeyHandlers(keystore);
  registerAskHandler(context, keystore);
}

function registerKeyHandlers(keystore: Keystore): void {
  ipcMain.handle(IPC.ai.hasKey, (): AiKeyStatus => ({ hasKey: keystore.hasKey() }));

  ipcMain.handle(IPC.ai.setKey, (_event, key: string): AiKeyStatus => {
    try {
      keystore.setKey(key);
    } catch (error) {
      throw toIpcError(error);
    }
    return { hasKey: keystore.hasKey() };
  });

  ipcMain.handle(IPC.ai.clearKey, (): AiKeyStatus => {
    keystore.clearKey();
    return { hasKey: keystore.hasKey() };
  });
}

function registerAskHandler(context: IpcContext, keystore: Keystore): void {
  ipcMain.handle(IPC.ai.ask, async (_event, request: AiAskRequest): Promise<AiAskResult> => {
    const emit = (chunk: AiChunk): void => {
      context.getWindow()?.webContents.send(IPC.ai.chunk, chunk);
    };
    try {
      const payload = readAskPayload(request);
      const apiKey = keystore.getKey();
      if (apiKey === null) throw new CenturionError('NO_KEY');
      return await new CenturionService({ apiKey }).ask(payload, emit);
    } catch (error) {
      // A payload/key failure never opened a stream, so close it here too: the
      // panel's typing indicator must stop on every path, not just the happy one.
      emit({ requestId: '', text: '', done: true });
      throw toIpcError(error);
    }
  });
}

/**
 * Electron flattens a thrown Error to its message across IPC, so the taxonomy
 * code rides in a `[CODE] ` prefix and everything else surfaces as plain
 * English. The API key can never appear here: neither error type carries it.
 */
function toIpcError(error: unknown): Error {
  if (error instanceof CenturionError) return error.toIpcError();
  if (error instanceof KeystoreError) return new Error(`[${error.code}] ${error.message}`);
  return new CenturionError('UNKNOWN').toIpcError();
}

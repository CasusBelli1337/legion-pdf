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
import { CenturionError, CenturionService } from '../services/anthropic';
import { Keystore, KeystoreError } from '../services/keystore';
import type { IpcContext } from './context';
import { registerNotImplemented } from './not-implemented';

/** Ciphertext only. Named for the panel so it is obvious what it belongs to. */
const KEY_FILE_NAME = 'centurion-key.dat';

export function registerAiHandlers(context: IpcContext): void {
  const keystore = new Keystore({
    keyFilePath: join(app.getPath('userData'), KEY_FILE_NAME),
    safeStorage,
  });
  registerKeyHandlers(keystore);
  registerAskHandler(context, keystore);
  // Tool use is proposed on an `ai:chunk` and waits for this answer. The lane
  // that runs the approved tool owns the handler; until then, refuse loudly
  // rather than let a confirm card look answered.
  registerNotImplemented([IPC.ai.toolDecision]);
}

function registerKeyHandlers(keystore: Keystore): void {
  ipcMain.handle(IPC.ai.hasKey, (): AiKeyStatus => ({ hasKey: keystore.hasKey() }));

  ipcMain.handle(IPC.ai.setKey, (_event, key: string): AiKeyStatus => {
    try {
      keystore.setKey(key);
    } catch (error) {
      throw plainError(error);
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
    const apiKey = readKey(keystore, emit);
    try {
      return await new CenturionService({ apiKey }).ask(request, emit);
    } catch (error) {
      // The service already closed the stream with the taxonomy code; only the
      // sentence has to survive the IPC boundary.
      throw plainError(error);
    }
  });
}

/**
 * The key lookup happens before any stream exists, so a failure here closes the
 * panel's typing indicator itself rather than leaving it typing forever.
 */
function readKey(keystore: Keystore, emit: (chunk: AiChunk) => void): string {
  try {
    const apiKey = keystore.getKey();
    if (apiKey === null) throw new CenturionError('NO_KEY');
    return apiKey;
  } catch (error) {
    const failure = keyFailure(error);
    emit({ requestId: '', text: '', done: true, code: failure.code });
    // The cause is a KeystoreError or a CenturionError; neither ever quotes the
    // key, and Electron drops it on the way to the renderer regardless.
    throw new Error(failure.message, { cause: error });
  }
}

/** A locked or unreadable key file is a key problem to the attorney. */
function keyFailure(error: unknown): CenturionError {
  if (error instanceof CenturionError) return error;
  if (error instanceof KeystoreError) return new CenturionError('BAD_KEY', error.message);
  return new CenturionError('UNKNOWN');
}

/**
 * Electron flattens a thrown Error to its message across IPC. Every message here
 * is already written for an attorney, and the API key can never appear in one:
 * neither error type carries it.
 */
function plainError(error: unknown): Error {
  if (error instanceof CenturionError || error instanceof KeystoreError) {
    return new Error(error.message);
  }
  return new Error(new CenturionError('UNKNOWN').message);
}

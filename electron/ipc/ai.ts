// #seam:ipc-contract
/**
 * LANE F (Centurion) — owned by the AI agent.
 * The API key lives in safeStorage in this process and never leaves it: the
 * renderer only ever learns `hasKey`. Every answer checks `stop_reason`; a
 * `max_tokens` stop is a failure to retry, never a result to display.
 */

import { invokeChannelsOf } from '@shared/ipc';
import type { IpcContext } from './context';
import { registerNotImplemented } from './not-implemented';

export function registerAiHandlers(_context: IpcContext): void {
  registerNotImplemented(invokeChannelsOf('ai'));
}

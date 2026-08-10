// #seam:ipc-contract
/**
 * LANE E (redaction) — owned by the redaction agent.
 * Apply DESTROYS content: rasterize the affected pages, burn the boxes in, and
 * rebuild. The verify pass must re-extract text and prove the marked strings
 * are gone before the result is ever presented as a success.
 */

import { invokeChannelsOf } from '@shared/ipc';
import type { IpcContext } from './context';
import { registerNotImplemented } from './not-implemented';

export function registerRedactHandlers(_context: IpcContext): void {
  registerNotImplemented(invokeChannelsOf('redact'));
}

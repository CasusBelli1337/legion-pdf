// #seam:ipc-contract
/**
 * LANE C (stamps) — owned by the stamps agent.
 * Bates, exhibit stamps, slip sheets, watermarks, page numbers, signatures,
 * text boxes, whiteout. Replace the body of registerStampHandlers with real
 * handlers delegating to core/stamps/**; leave the export signature alone.
 */

import { invokeChannelsOf } from '@shared/ipc';
import type { IpcContext } from './context';
import { registerNotImplemented } from './not-implemented';

export function registerStampHandlers(_context: IpcContext): void {
  registerNotImplemented(invokeChannelsOf('stamp'));
}

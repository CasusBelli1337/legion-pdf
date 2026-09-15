// #seam:ipc-contract
/**
 * LANE N (text editing) — the `edit:*` channels, wired to core/edit over the
 * doc store's bytes. Inspect is read-only. Replace swaps the store's copy on
 * success, which marks the document dirty and puts the old bytes on the undo
 * stack — an edited paragraph is undone the way every other change is.
 */

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  OpResult,
  ReplaceTextDetail,
  ReplaceTextOptions,
  TextEditBlock,
  TextEditProbe,
} from '@shared/types';
import { inspectTextAt, replaceText } from '@core/edit';
import { loadPdf } from '@core/ops';
import type { IpcContext } from './context';

/** The tag an edit carries in the history, for a receipt that names the step. */
export const TEXT_EDIT_TAG = 'text-edit';

export function registerEditHandlers({ store }: IpcContext): void {
  ipcMain.handle(
    IPC.edit.inspect,
    async (_event, docId: string, probe: TextEditProbe): Promise<TextEditBlock | null> => {
      return inspectTextAt(await loadPdf(store.bytes(docId)), probe);
    }
  );

  ipcMain.handle(
    IPC.edit.replaceText,
    async (
      _event,
      docId: string,
      options: ReplaceTextOptions
    ): Promise<OpResult<ReplaceTextDetail>> => {
      const result = await replaceText(store.bytes(docId), options);
      if (options.dryRun !== true) await store.setBytes(docId, result.bytes, TEXT_EDIT_TAG);
      return result;
    }
  );
}

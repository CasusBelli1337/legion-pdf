// #seam:ipc-contract
/**
 * LANE J (convert) — the `convert:*` channels.
 *
 * There is only one of them to answer: `convert:support`, which tells the
 * renderer what this particular computer can turn into a PDF and why. The
 * conversions themselves ride inside `file:open` and `ops:merge` (a .docx path
 * comes back as an unsaved PDF session), so this module's other job is wiring
 * the convert service's progress sink to `convert:progress` — the "Converting
 * letter.docx" the status bar shows while Word is working.
 */

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { ConvertSupport } from '@shared/types';
import { convertSupport, setConvertProgressSink } from '../services/convert';
import type { IpcContext } from './context';

export function registerConvertHandlers(context: IpcContext): void {
  // docId is null: a conversion is building a document that does not exist yet.
  setConvertProgressSink((phase, current, total) =>
    context.emitProgress(IPC.convert.progress, { docId: null, phase, current, total })
  );

  ipcMain.handle(IPC.convert.support, (): Promise<ConvertSupport> => convertSupport());
}

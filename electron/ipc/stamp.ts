// #seam:ipc-contract
/**
 * LANE C (stamps) — every `stamp:*` channel, wired to the pure functions in
 * core/stamps over the doc store's bytes. This file holds no PDF logic: it
 * reads bytes, calls core, swaps the store's copy on success (which marks the
 * document dirty), and streams page-level progress to the UI.
 *
 * The signature library is the one piece of state a stamp handler owns; it
 * lives in userData and is managed by ./stamp-signatures.
 */

import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type {
  BatesDetail,
  BatesOptions,
  ExhibitDetail,
  ExhibitOptions,
  OpResult,
  PageNumberDetail,
  PageNumberOptions,
  SignatureAsset,
  SignaturePlacement,
  SlipSheetOptions,
  TextBoxOptions,
  WatermarkOptions,
  WhiteoutOptions,
} from '@shared/types';
import type { ProgressReporter } from '@core/ops';
import {
  addTextBox,
  applyBates,
  applyExhibitStamp,
  applyPageNumbers,
  applyWatermark,
  applyWhiteout,
  formatDateStamp,
  insertSlipSheet,
  placeSignature,
} from '@core/stamps';
import type { IpcContext } from './context';
import { SignatureLibrary } from './stamp-signatures';

/** Where the attorney's scanned signatures live. */
export const SIGNATURE_DIRECTORY = 'signatures';

function reporter(context: IpcContext, docId: string, phase: string): ProgressReporter {
  return (current, total) =>
    context.emitProgress(IPC.stamp.progress, { docId, phase, current, total });
}

/** Swaps the store's bytes for the op's output; the store marks it dirty. */
async function keep<T>(
  context: IpcContext,
  docId: string,
  result: OpResult<T>
): Promise<OpResult<T>> {
  await context.store.setBytes(docId, result.bytes);
  return result;
}

function registerNumberingHandlers(context: IpcContext): void {
  ipcMain.handle(
    IPC.stamp.bates,
    async (_event, docId: string, options: BatesOptions): Promise<OpResult<BatesDetail>> =>
      keep(
        context,
        docId,
        await applyBates(
          context.store.bytes(docId),
          options,
          reporter(context, docId, 'Stamping Bates numbers')
        )
      )
  );

  ipcMain.handle(
    IPC.stamp.pageNumbers,
    async (
      _event,
      docId: string,
      options: PageNumberOptions
    ): Promise<OpResult<PageNumberDetail>> =>
      keep(
        context,
        docId,
        await applyPageNumbers(
          context.store.bytes(docId),
          options,
          reporter(context, docId, 'Adding page numbers')
        )
      )
  );
}

function registerMarkHandlers(context: IpcContext): void {
  ipcMain.handle(
    IPC.stamp.exhibit,
    async (_event, docId: string, options: ExhibitOptions): Promise<OpResult<ExhibitDetail>> =>
      keep(
        context,
        docId,
        await applyExhibitStamp(
          context.store.bytes(docId),
          options,
          reporter(context, docId, 'Stamping exhibits')
        )
      )
  );

  ipcMain.handle(
    IPC.stamp.watermark,
    async (_event, docId: string, options: WatermarkOptions): Promise<OpResult> =>
      keep(
        context,
        docId,
        await applyWatermark(
          context.store.bytes(docId),
          options,
          reporter(context, docId, 'Applying watermark')
        )
      )
  );

  ipcMain.handle(
    IPC.stamp.slipSheet,
    async (_event, docId: string, options: SlipSheetOptions): Promise<OpResult> =>
      keep(context, docId, await insertSlipSheet(context.store.bytes(docId), options))
  );
}

function registerTextHandlers(context: IpcContext): void {
  ipcMain.handle(
    IPC.stamp.textBox,
    async (_event, docId: string, options: TextBoxOptions): Promise<OpResult> =>
      keep(context, docId, await addTextBox(context.store.bytes(docId), options))
  );

  ipcMain.handle(
    IPC.stamp.whiteout,
    async (_event, docId: string, options: WhiteoutOptions): Promise<OpResult> =>
      keep(context, docId, await applyWhiteout(context.store.bytes(docId), options))
  );
}

async function applyPlacement(
  context: IpcContext,
  library: SignatureLibrary,
  docId: string,
  placement: SignaturePlacement
): Promise<OpResult> {
  const png = await library.bytesOf(placement.signatureId);
  const result = await placeSignature(context.store.bytes(docId), {
    page: placement.page,
    png,
    at: placement.at,
    widthPt: placement.widthPt,
    heightPt: placement.heightPt,
    ...(placement.withDate ? { dateText: formatDateStamp(new Date(), placement.dateFormat) } : {}),
  });
  return keep(context, docId, result);
}

function registerSignatureHandlers(context: IpcContext, library: SignatureLibrary): void {
  ipcMain.handle(IPC.stamp.signatureList, (): Promise<SignatureAsset[]> =>
    library.listWithThumbnails()
  );

  ipcMain.handle(
    IPC.stamp.signatureAdd,
    (_event, sourcePath: string, label: string): Promise<SignatureAsset> =>
      library.add(sourcePath, label)
  );

  ipcMain.handle(
    IPC.stamp.signatureRemove,
    (_event, signatureId: string): Promise<SignatureAsset[]> => library.remove(signatureId)
  );

  ipcMain.handle(
    IPC.stamp.signaturePlace,
    (_event, docId: string, placement: SignaturePlacement): Promise<OpResult> =>
      applyPlacement(context, library, docId, placement)
  );
}

export function registerStampHandlers(context: IpcContext): void {
  const library = new SignatureLibrary(join(app.getPath('userData'), SIGNATURE_DIRECTORY));
  registerNumberingHandlers(context);
  registerMarkHandlers(context);
  registerTextHandlers(context);
  registerSignatureHandlers(context, library);
}

// #seam:ipc-contract
/**
 * The only door between renderer and main. Every method is a thin, typed
 * pass-through to a channel declared in shared/ipc.ts — no logic here, and no
 * raw ipcRenderer ever reaches the renderer. Handlers that a feature lane has
 * not built yet reject with `NotImplemented: <channel>` from the main side.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPC, PUSH_CHANNELS } from '@shared/ipc';
import type {
  InvokeChannel,
  InvokeRequest,
  InvokeResponse,
  IpcMainToRendererContract,
  ProgressChannel,
  PushChannel,
} from '@shared/ipc';
import type { LibrariusBridge, Unsubscribe } from '@shared/bridge';
import type {
  AiChunk,
  MenuAction,
  OpenFilesEvent,
  ProgressEvent,
  RasterRequest,
  RasterResponse,
} from '@shared/types';

function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeRequest<C>
): Promise<InvokeResponse<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResponse<C>>;
}

function subscribe<C extends PushChannel>(
  channel: C,
  callback: (payload: IpcMainToRendererContract[C]) => void
): Unsubscribe {
  if (!PUSH_CHANNELS.includes(channel)) {
    throw new Error(`Refusing to subscribe to unlisted channel: ${channel}`);
  }
  const listener = (_event: IpcRendererEvent, payload: IpcMainToRendererContract[C]): void =>
    callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

const bridge: LibrariusBridge = {
  file: {
    openDialog: () => invoke(IPC.file.openDialog),
    open: (filePath) => invoke(IPC.file.open, filePath),
    read: (docId) => invoke(IPC.file.read, docId),
    save: (docId) => invoke(IPC.file.save, docId),
    saveAs: (docId, suggestedName) => invoke(IPC.file.saveAs, docId, suggestedName),
    recent: () => invoke(IPC.file.recent),
    recentClear: () => invoke(IPC.file.recentClear),
    close: (docId) => invoke(IPC.file.close, docId),
    undo: (docId) => invoke(IPC.file.undo, docId),
    redo: (docId) => invoke(IPC.file.redo, docId),
    undoState: (docId) => invoke(IPC.file.undoState, docId),
    pathForDrop: (file) => webUtils.getPathForFile(file),
  },
  ops: {
    merge: (options) => invoke(IPC.ops.merge, options),
    split: (docId, options) => invoke(IPC.ops.split, docId, options),
    reorder: (docId, options) => invoke(IPC.ops.reorder, docId, options),
    rotate: (docId, options) => invoke(IPC.ops.rotate, docId, options),
    delete: (docId, options) => invoke(IPC.ops.delete, docId, options),
    extract: (docId, options) => invoke(IPC.ops.extract, docId, options),
    insertBlank: (docId, options) => invoke(IPC.ops.insertBlank, docId, options),
    insertFrom: (docId, options) => invoke(IPC.ops.insertFrom, docId, options),
    bookmarksGet: (docId) => invoke(IPC.ops.bookmarksGet, docId),
    bookmarksSet: (docId, tree) => invoke(IPC.ops.bookmarksSet, docId, tree),
    scrubMetadata: (docId, options) => invoke(IPC.ops.scrubMetadata, docId, options),
    flatten: (docId, options) => invoke(IPC.ops.flatten, docId, options),
  },
  stamp: {
    bates: (docId, options) => invoke(IPC.stamp.bates, docId, options),
    exhibit: (docId, options) => invoke(IPC.stamp.exhibit, docId, options),
    slipSheet: (docId, options) => invoke(IPC.stamp.slipSheet, docId, options),
    watermark: (docId, options) => invoke(IPC.stamp.watermark, docId, options),
    pageNumbers: (docId, options) => invoke(IPC.stamp.pageNumbers, docId, options),
    signatureList: () => invoke(IPC.stamp.signatureList),
    signatureAdd: (sourcePath, label) => invoke(IPC.stamp.signatureAdd, sourcePath, label),
    signatureAddBytes: (data, label) => invoke(IPC.stamp.signatureAddBytes, data, label),
    signatureRemove: (signatureId) => invoke(IPC.stamp.signatureRemove, signatureId),
    signaturePlace: (docId, placement) => invoke(IPC.stamp.signaturePlace, docId, placement),
    textBox: (docId, options) => invoke(IPC.stamp.textBox, docId, options),
    whiteout: (docId, options) => invoke(IPC.stamp.whiteout, docId, options),
  },
  ocr: {
    detect: (docId) => invoke(IPC.ocr.detect, docId),
    run: (docId, options) => invoke(IPC.ocr.run, docId, options),
    cancel: (docId) => invoke(IPC.ocr.cancel, docId),
    bulk: (paths, options) => invoke(IPC.ocr.bulk, paths, options),
    bulkCancel: () => invoke(IPC.ocr.bulkCancel),
  },
  redact: {
    apply: (docId, options) => invoke(IPC.redact.apply, docId, options),
    verify: (docId, strings) => invoke(IPC.redact.verify, docId, strings),
  },
  ai: {
    hasKey: () => invoke(IPC.ai.hasKey),
    setKey: (key) => invoke(IPC.ai.setKey, key),
    clearKey: () => invoke(IPC.ai.clearKey),
    ask: (request) => invoke(IPC.ai.ask, request),
    onChunk: (callback: (chunk: AiChunk) => void) => subscribe(IPC.ai.chunk, callback),
    toolDecision: (requestId, toolUseId, decision) =>
      invoke(IPC.ai.toolDecision, requestId, toolUseId, decision),
  },
  app: {
    print: (docId) => invoke(IPC.app.print, docId),
    openPath: (target) => invoke(IPC.app.openPath, target),
    version: () => invoke(IPC.app.version),
    confirmClose: (fileName) => invoke(IPC.app.confirmClose, fileName),
    onMenuAction: (callback: (action: MenuAction) => void) => subscribe(IPC.app.menu, callback),
    onOpenFiles: (callback: (event: OpenFilesEvent) => void) =>
      subscribe(IPC.app.openFiles, callback),
  },
  raster: {
    onRequest: (callback: (request: RasterRequest) => void) =>
      subscribe(IPC.raster.request, callback),
    respond: (response: RasterResponse) => ipcRenderer.send(IPC.raster.response, response),
  },
  onProgress: (channel: ProgressChannel, callback: (event: ProgressEvent) => void) =>
    subscribe(channel, callback),
  on: subscribe,
};

contextBridge.exposeInMainWorld('librarius', bridge);

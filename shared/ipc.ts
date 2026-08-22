// #seam:ipc-contract
/**
 * Single source of truth for every IPC channel name and payload type.
 * The invoke map itself lives in `./ipc-contract.ts` (it grows with every
 * feature lane) and is re-exported here, so `@shared/ipc` stays the one import
 * path. Every handler-registration site in electron/ipc/ carries the same
 * `#seam:ipc-contract` marker so the contract and its handlers stay greppable
 * together: `grep -rn "#seam:ipc-contract"`.
 */

import type { IpcInvokeContract } from './ipc-contract';
import type {
  AiChunk,
  MenuAction,
  OpenFilesEvent,
  ProgressEvent,
  RasterRequest,
  RasterResponse,
} from './types';

export type { IpcInvokeContract } from './ipc-contract';

/** Channel names, grouped exactly as the architecture doc groups them. */
export const IPC = {
  file: {
    openDialog: 'file:openDialog',
    open: 'file:open',
    read: 'file:read',
    save: 'file:save',
    saveAs: 'file:saveAs',
    saveTo: 'file:saveTo',
    chooseFolder: 'file:chooseFolder',
    recent: 'file:recent',
    recentClear: 'file:recentClear',
    close: 'file:close',
    undo: 'file:undo',
    redo: 'file:redo',
    undoState: 'file:undoState',
  },
  ops: {
    merge: 'ops:merge',
    split: 'ops:split',
    reorder: 'ops:reorder',
    rotate: 'ops:rotate',
    delete: 'ops:delete',
    extract: 'ops:extract',
    insertBlank: 'ops:insertBlank',
    insertFrom: 'ops:insertFrom',
    bookmarksGet: 'ops:bookmarksGet',
    bookmarksSet: 'ops:bookmarksSet',
    scrubMetadata: 'ops:scrubMetadata',
    flatten: 'ops:flatten',
    fillForm: 'ops:fillForm',
    progress: 'ops:progress',
  },
  stamp: {
    bates: 'stamp:bates',
    exhibit: 'stamp:exhibit',
    slipSheet: 'stamp:slipSheet',
    watermark: 'stamp:watermark',
    pageNumbers: 'stamp:pageNumbers',
    signatureList: 'stamp:signatureList',
    signatureAdd: 'stamp:signatureAdd',
    signatureAddBytes: 'stamp:signatureAddBytes',
    signatureRemove: 'stamp:signatureRemove',
    signaturePlace: 'stamp:signaturePlace',
    textBox: 'stamp:textBox',
    whiteout: 'stamp:whiteout',
    highlight: 'stamp:highlight',
    progress: 'stamp:progress',
  },
  ocr: {
    detect: 'ocr:detect',
    run: 'ocr:run',
    cancel: 'ocr:cancel',
    bulk: 'ocr:bulk',
    bulkCancel: 'ocr:bulkCancel',
    progress: 'ocr:progress',
  },
  redact: {
    apply: 'redact:apply',
    verify: 'redact:verify',
    progress: 'redact:progress',
  },
  ai: {
    hasKey: 'ai:hasKey',
    setKey: 'ai:setKey',
    clearKey: 'ai:clearKey',
    ask: 'ai:ask',
    chunk: 'ai:chunk',
    toolDecision: 'ai:toolDecision',
  },
  app: {
    print: 'app:print',
    openPath: 'app:openPath',
    version: 'app:version',
    confirmClose: 'app:confirmClose',
    menu: 'app:menu',
    openFiles: 'app:openFiles',
  },
  raster: {
    request: 'raster:request',
    response: 'raster:response',
  },
} as const;

export type InvokeChannel = keyof IpcInvokeContract;
export type InvokeRequest<C extends InvokeChannel> = IpcInvokeContract[C]['request'];
export type InvokeResponse<C extends InvokeChannel> = IpcInvokeContract[C]['response'];

/** Main → renderer pushes. Subscribed through the bridge, never raw ipcRenderer. */
export interface IpcMainToRendererContract {
  'ops:progress': ProgressEvent;
  'stamp:progress': ProgressEvent;
  'ocr:progress': ProgressEvent;
  'redact:progress': ProgressEvent;
  'ai:chunk': AiChunk;
  'app:menu': MenuAction;
  /** Paths the OS handed the app (double-click, drop on icon, command line). */
  'app:openFiles': OpenFilesEvent;
  'raster:request': RasterRequest;
}

/** Renderer → main fire-and-forget sends. */
export interface IpcRendererToMainContract {
  'raster:response': RasterResponse;
}

export type PushChannel = keyof IpcMainToRendererContract;
export type SendChannel = keyof IpcRendererToMainContract;

/** Channels that stream `ProgressEvent`s — what the UI subscribes to for "Page 37/214". */
export type ProgressChannel =
  'ops:progress' | 'stamp:progress' | 'ocr:progress' | 'redact:progress';

/** Every channel the preload is allowed to relay. Anything else is rejected. */
export const PUSH_CHANNELS: readonly PushChannel[] = [
  'ops:progress',
  'stamp:progress',
  'ocr:progress',
  'redact:progress',
  'ai:chunk',
  'app:menu',
  'app:openFiles',
  'raster:request',
];

type ChannelGroup = keyof typeof IPC;
type ChannelLiteral = { [G in ChannelGroup]: (typeof IPC)[G][keyof (typeof IPC)[G]] }[ChannelGroup];
type DeclaredInvokeChannel = Exclude<ChannelLiteral, PushChannel | SendChannel>;

/**
 * Drift guards for `#seam:ipc-contract`: the IPC constant here and
 * IpcInvokeContract in ./ipc-contract.ts must describe exactly the same set of
 * invokable channels. Adding a channel to one without the other is a compile
 * error, not a runtime surprise — which is what keeps the split honest.
 */
type Assert<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;
export type ContractCoversEveryChannel = Assert<
  IsNever<Exclude<DeclaredInvokeChannel, InvokeChannel>>
>;
export type EveryContractEntryHasAChannel = Assert<
  IsNever<Exclude<InvokeChannel, DeclaredInvokeChannel>>
>;

const NON_INVOKE_CHANNELS: readonly string[] = [...PUSH_CHANNELS, 'raster:response'];

/** The invokable channels of one group — what a lane's handler module registers. */
export function invokeChannelsOf(group: ChannelGroup): InvokeChannel[] {
  return Object.values(IPC[group]).filter(
    (channel): channel is InvokeChannel => !NON_INVOKE_CHANNELS.includes(channel)
  );
}

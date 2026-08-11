// #seam:ipc-contract
/**
 * Single source of truth for every IPC channel name and payload type.
 * Every handler-registration site in electron/ipc/ carries the same
 * `#seam:ipc-contract` marker so the contract and its handlers stay greppable
 * together: `grep -rn "#seam:ipc-contract"`.
 */

import type {
  AiAskRequest,
  AiAskResult,
  AiChunk,
  AiKeyStatus,
  AppVersionInfo,
  BatesDetail,
  BatesOptions,
  BookmarkNode,
  BulkOcrOptions,
  BulkOcrResult,
  CenturionToolDecision,
  CloseChoice,
  DeletePagesOptions,
  DocumentSession,
  ExhibitDetail,
  ExhibitOptions,
  ExtractDetail,
  ExtractOptions,
  FlattenDetail,
  FlattenOptions,
  InsertBlankOptions,
  InsertFromOptions,
  MenuAction,
  MergeDetail,
  MergeOptions,
  OcrDetectResult,
  OcrOptions,
  OcrRunDetail,
  OpenFilesEvent,
  OpResult,
  PageNumberDetail,
  PageNumberOptions,
  ProgressEvent,
  RasterRequest,
  RasterResponse,
  RecentFile,
  RedactApplyOptions,
  RedactVerifyResult,
  ReorderOptions,
  RotateOptions,
  SaveResult,
  ScrubDetail,
  ScrubMetadataOptions,
  SignatureAsset,
  SignaturePlacement,
  SlipSheetOptions,
  SplitDetail,
  SplitOptions,
  TextBoxOptions,
  UndoResult,
  UndoState,
  WatermarkOptions,
  WhiteoutOptions,
} from './types';

/** Channel names, grouped exactly as the architecture doc groups them. */
export const IPC = {
  file: {
    openDialog: 'file:openDialog',
    open: 'file:open',
    read: 'file:read',
    save: 'file:save',
    saveAs: 'file:saveAs',
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

/**
 * Request/response map for every `ipcRenderer.invoke` channel.
 * `request` is the argument tuple; `response` is the resolved value.
 */
export interface IpcInvokeContract {
  'file:openDialog': { request: []; response: string[] };
  'file:open': { request: [filePath: string]; response: DocumentSession };
  'file:read': { request: [docId: string]; response: DocumentSession };
  'file:save': { request: [docId: string]; response: SaveResult };
  /** Resolves null when the user cancels the dialog. */
  'file:saveAs': {
    request: [docId: string, suggestedName?: string];
    response: SaveResult | null;
  };
  'file:recent': { request: []; response: RecentFile[] };
  'file:recentClear': { request: []; response: RecentFile[] };
  'file:close': { request: [docId: string]; response: void };
  /**
   * Steps the document back to the previous state. `applied: false` means the
   * history was already at its end — a no-op, not a failure. The renderer
   * re-reads bytes with `file:read` whenever `applied` is true.
   */
  'file:undo': { request: [docId: string]; response: UndoResult };
  'file:redo': { request: [docId: string]; response: UndoResult };
  /** Drives the enabled state of the Undo/Redo controls. */
  'file:undoState': { request: [docId: string]; response: UndoState };

  /** Creates a NEW document; `detail.docId` is the tab the renderer opens. */
  'ops:merge': { request: [options: MergeOptions]; response: OpResult<MergeDetail> };
  /** Non-destructive: `bytes` is the unchanged source; the parts are new documents. */
  'ops:split': {
    request: [docId: string, options: SplitOptions];
    response: OpResult<SplitDetail>;
  };
  'ops:reorder': { request: [docId: string, options: ReorderOptions]; response: OpResult };
  'ops:rotate': { request: [docId: string, options: RotateOptions]; response: OpResult };
  'ops:delete': { request: [docId: string, options: DeletePagesOptions]; response: OpResult };
  /** Creates a NEW document from the selected pages; `detail.docId` is its tab. */
  'ops:extract': {
    request: [docId: string, options: ExtractOptions];
    response: OpResult<ExtractDetail>;
  };
  'ops:insertBlank': { request: [docId: string, options: InsertBlankOptions]; response: OpResult };
  'ops:insertFrom': { request: [docId: string, options: InsertFromOptions]; response: OpResult };
  'ops:bookmarksGet': { request: [docId: string]; response: BookmarkNode[] };
  'ops:bookmarksSet': { request: [docId: string, tree: BookmarkNode[]]; response: OpResult };
  'ops:scrubMetadata': {
    request: [docId: string, options: ScrubMetadataOptions];
    response: OpResult<ScrubDetail>;
  };
  'ops:flatten': {
    request: [docId: string, options: FlattenOptions];
    response: OpResult<FlattenDetail>;
  };

  'stamp:bates': {
    request: [docId: string, options: BatesOptions];
    response: OpResult<BatesDetail>;
  };
  'stamp:exhibit': {
    request: [docId: string, options: ExhibitOptions];
    response: OpResult<ExhibitDetail>;
  };
  'stamp:slipSheet': { request: [docId: string, options: SlipSheetOptions]; response: OpResult };
  'stamp:watermark': { request: [docId: string, options: WatermarkOptions]; response: OpResult };
  'stamp:pageNumbers': {
    request: [docId: string, options: PageNumberOptions];
    response: OpResult<PageNumberDetail>;
  };
  'stamp:signatureList': { request: []; response: SignatureAsset[] };
  'stamp:signatureAdd': {
    request: [sourcePath: string, label: string];
    response: SignatureAsset;
  };
  /**
   * Same library entry as `stamp:signatureAdd`, from bytes already in hand — a
   * pasted image or a drawn-on-canvas signature that never existed as a file.
   * A Uint8Array crosses structured clone intact; the raster channels already
   * carry PNG bytes both ways.
   */
  'stamp:signatureAddBytes': {
    request: [data: Uint8Array, label: string];
    response: SignatureAsset;
  };
  'stamp:signatureRemove': { request: [signatureId: string]; response: SignatureAsset[] };
  'stamp:signaturePlace': {
    request: [docId: string, placement: SignaturePlacement];
    response: OpResult;
  };
  'stamp:textBox': { request: [docId: string, options: TextBoxOptions]; response: OpResult };
  'stamp:whiteout': { request: [docId: string, options: WhiteoutOptions]; response: OpResult };

  'ocr:detect': { request: [docId: string]; response: OcrDetectResult };
  'ocr:run': { request: [docId: string, options: OcrOptions]; response: OpResult<OcrRunDetail> };
  'ocr:cancel': { request: [docId: string]; response: void };
  /**
   * OCR whole files off disk, none of them open in a tab. The result carries one
   * entry per input path, in request order, so a skipped file is visible rather
   * than absent. Progress streams on `ocr:progress`.
   */
  'ocr:bulk': {
    request: [paths: string[], options: BulkOcrOptions];
    response: BulkOcrResult;
  };
  /** Stops the run after the file in flight; finished files keep their output. */
  'ocr:bulkCancel': { request: []; response: void };

  /** Destruction. The result carries the verification receipt in `detail`. */
  'redact:apply': {
    request: [docId: string, options: RedactApplyOptions];
    response: OpResult<RedactVerifyResult>;
  };
  'redact:verify': {
    request: [docId: string, strings: string[]];
    response: RedactVerifyResult;
  };

  'ai:hasKey': { request: []; response: AiKeyStatus };
  'ai:setKey': { request: [key: string]; response: AiKeyStatus };
  'ai:clearKey': { request: []; response: AiKeyStatus };
  /** Streams deltas on `ai:chunk`; resolves with the completed answer. */
  'ai:ask': { request: [request: AiAskRequest]; response: AiAskResult };
  /**
   * The attorney's answer to a tool confirm card. 'rejected' is a normal
   * outcome: the model is told the tool was declined and keeps talking.
   */
  'ai:toolDecision': {
    request: [requestId: string, toolUseId: string, decision: CenturionToolDecision];
    response: void;
  };

  'app:print': { request: [docId: string]; response: void };
  'app:openPath': { request: [target: string]; response: void };
  'app:version': { request: []; response: AppVersionInfo };
  /** Native three-way prompt before a tab with unsaved work is dropped. */
  'app:confirmClose': { request: [fileName: string]; response: CloseChoice };
}

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
 * Drift guards for `#seam:ipc-contract`: the IPC constant and IpcInvokeContract
 * must describe exactly the same set of invokable channels. Adding a channel to
 * one without the other is a compile error, not a runtime surprise.
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

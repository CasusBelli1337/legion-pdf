// #seam:ipc-contract
/**
 * The request/response map for every `ipcRenderer.invoke` channel — the half of
 * the IPC contract that grows with every feature lane, split out of
 * `./ipc.ts` so neither file runs past the 300-line limit. Nothing else lives
 * here.
 *
 * `./ipc.ts` re-exports `IpcInvokeContract`, so `@shared/ipc` remains the one
 * import path for the contract, the channel constants, and the drift guards
 * that hold them together. Both files carry the `#seam:ipc-contract` marker,
 * as does every handler-registration site in electron/ipc/.
 */

import type {
  AiAskRequest,
  AiAskResult,
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
  HighlightOptions,
  InsertBlankOptions,
  InsertFromOptions,
  MergeDetail,
  MergeOptions,
  OcrDetectResult,
  OcrOptions,
  OcrRunDetail,
  OpResult,
  PageNumberDetail,
  PageNumberOptions,
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
  /**
   * Save As without the dialog: the caller already knows the target path.
   * Same atomic write as `file:saveAs` — what scripts, QA automation, and any
   * flow that computes its own output name use.
   */
  'file:saveTo': { request: [docId: string, targetPath: string]; response: SaveResult };
  /** Folder picker for "where do the output files go". Null when cancelled. */
  'file:chooseFolder': { request: []; response: string | null };
  'file:recent': { request: []; response: RecentFile[] };
  'file:recentClear': { request: []; response: RecentFile[] };
  'file:close': { request: [docId: string]; response: void };
  /**
   * Steps the document back to the previous state. `applied: false` means the
   * history was already at its end — a no-op, not a failure. The renderer
   * re-reads bytes with `file:read` whenever `applied` is true, and reads
   * `tag` to roll its own state back alongside them.
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
  /** Translucent marker over the given boxes — the highlight lane draws it. */
  'stamp:highlight': { request: [docId: string, options: HighlightOptions]; response: OpResult };

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

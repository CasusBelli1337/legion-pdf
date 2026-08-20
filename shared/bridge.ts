// #seam:ipc-contract
/**
 * The typed surface the preload exposes as `window.librarius`.
 * The renderer NEVER touches ipcRenderer directly — this interface is the
 * whole contract between src/ and electron/.
 */

import type { IpcMainToRendererContract, ProgressChannel, PushChannel } from './ipc';
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
  HighlightOptions,
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

/** Call to stop receiving a subscribed event. Always call it on unmount. */
export type Unsubscribe = () => void;

export interface FileBridge {
  /** Shows the open dialog; resolves the chosen absolute paths (empty if cancelled). */
  openDialog(): Promise<string[]>;
  open(filePath: string): Promise<DocumentSession>;
  /** Re-pull the store's current bytes for a document (after a main-side op). */
  read(docId: string): Promise<DocumentSession>;
  save(docId: string): Promise<SaveResult>;
  saveAs(docId: string, suggestedName?: string): Promise<SaveResult | null>;
  /** Save As to a known path — no dialog, same atomic write. */
  saveTo(docId: string, targetPath: string): Promise<SaveResult>;
  /** Asks for an output folder; resolves null when the attorney cancels. */
  chooseFolder(): Promise<string | null>;
  recent(): Promise<RecentFile[]>;
  recentClear(): Promise<RecentFile[]>;
  close(docId: string): Promise<void>;
  /** Steps back one edit. `applied: false` means there was nothing to undo. */
  undo(docId: string): Promise<UndoResult>;
  redo(docId: string): Promise<UndoResult>;
  /** Current history position — what the Undo/Redo controls enable off. */
  undoState(docId: string): Promise<UndoState>;
  /** Absolute path of a dropped File. Electron 32+ removed File.path; this uses webUtils. */
  pathForDrop(file: File): string;
}

export interface OpsBridge {
  merge(options: MergeOptions): Promise<OpResult<MergeDetail>>;
  split(docId: string, options: SplitOptions): Promise<OpResult<SplitDetail>>;
  reorder(docId: string, options: ReorderOptions): Promise<OpResult>;
  rotate(docId: string, options: RotateOptions): Promise<OpResult>;
  delete(docId: string, options: DeletePagesOptions): Promise<OpResult>;
  extract(docId: string, options: ExtractOptions): Promise<OpResult<ExtractDetail>>;
  insertBlank(docId: string, options: InsertBlankOptions): Promise<OpResult>;
  insertFrom(docId: string, options: InsertFromOptions): Promise<OpResult>;
  bookmarksGet(docId: string): Promise<BookmarkNode[]>;
  bookmarksSet(docId: string, tree: BookmarkNode[]): Promise<OpResult>;
  scrubMetadata(docId: string, options: ScrubMetadataOptions): Promise<OpResult<ScrubDetail>>;
  flatten(docId: string, options: FlattenOptions): Promise<OpResult<FlattenDetail>>;
}

export interface StampBridge {
  bates(docId: string, options: BatesOptions): Promise<OpResult<BatesDetail>>;
  exhibit(docId: string, options: ExhibitOptions): Promise<OpResult<ExhibitDetail>>;
  slipSheet(docId: string, options: SlipSheetOptions): Promise<OpResult>;
  watermark(docId: string, options: WatermarkOptions): Promise<OpResult>;
  pageNumbers(docId: string, options: PageNumberOptions): Promise<OpResult<PageNumberDetail>>;
  signatureList(): Promise<SignatureAsset[]>;
  signatureAdd(sourcePath: string, label: string): Promise<SignatureAsset>;
  /** Same library entry from bytes in hand — a pasted or drawn signature. */
  signatureAddBytes(data: Uint8Array, label: string): Promise<SignatureAsset>;
  signatureRemove(signatureId: string): Promise<SignatureAsset[]>;
  signaturePlace(docId: string, placement: SignaturePlacement): Promise<OpResult>;
  textBox(docId: string, options: TextBoxOptions): Promise<OpResult>;
  whiteout(docId: string, options: WhiteoutOptions): Promise<OpResult>;
  /** Translucent marker over the given boxes; the text underneath is untouched. */
  highlight(docId: string, options: HighlightOptions): Promise<OpResult>;
}

export interface OcrBridge {
  detect(docId: string): Promise<OcrDetectResult>;
  run(docId: string, options: OcrOptions): Promise<OpResult<OcrRunDetail>>;
  cancel(docId: string): Promise<void>;
  /** OCRs files on disk without opening them; one result per input path. */
  bulk(paths: string[], options: BulkOcrOptions): Promise<BulkOcrResult>;
  /** Stops after the file in flight; finished files keep their output. */
  bulkCancel(): Promise<void>;
}

export interface RedactBridge {
  /** Destroys content. Always followed by a forced Save As in the UI. */
  apply(docId: string, options: RedactApplyOptions): Promise<OpResult<RedactVerifyResult>>;
  verify(docId: string, strings: string[]): Promise<RedactVerifyResult>;
}

export interface AiBridge {
  hasKey(): Promise<AiKeyStatus>;
  setKey(key: string): Promise<AiKeyStatus>;
  clearKey(): Promise<AiKeyStatus>;
  /** Streams deltas to `onChunk`; resolves with the finished, stop_reason-checked answer. */
  ask(request: AiAskRequest): Promise<AiAskResult>;
  onChunk(callback: (chunk: AiChunk) => void): Unsubscribe;
  /** Answers a tool confirm card. Nothing runs until this carries 'approved'. */
  toolDecision(
    requestId: string,
    toolUseId: string,
    decision: CenturionToolDecision
  ): Promise<void>;
}

export interface AppBridge {
  print(docId: string): Promise<void>;
  /**
   * A file or folder, opened by the OS. An `https://` URL is the one exception
   * and goes to the default browser instead — no other scheme is allowed out
   * (electron/services/external-link.ts).
   */
  openPath(target: string): Promise<void>;
  version(): Promise<AppVersionInfo>;
  /**
   * Asks about unsaved work before a tab is closed. Native, main-process, and
   * three-way: save and close, close without saving, or cancel.
   */
  confirmClose(fileName: string): Promise<CloseChoice>;
  /** File/View/Help menu items arrive here as plain actions. */
  onMenuAction(callback: (action: MenuAction) => void): Unsubscribe;
  /**
   * Files the OS handed the app — double-clicked, dropped on the icon, or on the
   * command line. Subscribe early: the first batch can arrive during startup.
   */
  onOpenFiles(callback: (event: OpenFilesEvent) => void): Unsubscribe;
}

export interface RasterBridge {
  /** Main asks the renderer (the only zone with a canvas) for a page raster. */
  onRequest(callback: (request: RasterRequest) => void): Unsubscribe;
  respond(response: RasterResponse): void;
}

export interface LibrariusBridge {
  file: FileBridge;
  ops: OpsBridge;
  stamp: StampBridge;
  ocr: OcrBridge;
  redact: RedactBridge;
  ai: AiBridge;
  app: AppBridge;
  raster: RasterBridge;
  /** Subscribe to a batch op's page-level progress. Returns an unsubscribe fn. */
  onProgress(channel: ProgressChannel, callback: (event: ProgressEvent) => void): Unsubscribe;
  /** Escape hatch for any main→renderer push channel, still fully typed. */
  on<C extends PushChannel>(
    channel: C,
    callback: (payload: IpcMainToRendererContract[C]) => void
  ): Unsubscribe;
}

// #seam:ipc-contract
/**
 * LANE B (core ops) — every `ops:*` channel, wired to the pure functions in
 * core/ops over the doc store's bytes. This file holds no PDF logic: it reads
 * bytes, calls core, swaps the store's copy on success (which marks the
 * document dirty), and streams page-level progress to the UI.
 */

import { basename } from 'node:path';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  BookmarkNode,
  DeletePagesOptions,
  ExtractDetail,
  ExtractOptions,
  FillFormDetail,
  FillFormOptions,
  FlattenDetail,
  FlattenOptions,
  InsertBlankOptions,
  InsertFromOptions,
  MergeDetail,
  MergeOptions,
  MergeSource,
  OpResult,
  ReorderOptions,
  RotateOptions,
  ScrubDetail,
  ScrubMetadataOptions,
  SplitDetail,
  SplitOptions,
} from '@shared/types';
import type { MergeSourceDocument, ProgressReporter } from '@core/ops';
import {
  deletePages,
  extractPages,
  fillFormFields,
  flattenAnnotations,
  getBookmarks,
  insertBlankPages,
  insertPagesFrom,
  mergeDocuments,
  reorderPages,
  rotatePages,
  scrubMetadata,
  setBookmarks,
  splitByRanges,
} from '@core/ops';
import { readPdfFile } from '../services/pdf-intake';
import type { IpcContext } from './context';

/** A combine is building a document that has no id yet, hence `docId: null`. */
function reporter(context: IpcContext, docId: string | null, phase: string): ProgressReporter {
  return (current, total) =>
    context.emitProgress(IPC.ops.progress, { docId, phase, current, total });
}

/**
 * Ops that produce a WHOLE NEW document (combine, split parts, extract) adopt it
 * into the store here; the id travels back in the op's `detail` and the renderer
 * opens it in a fresh tab.
 */
async function adopt(context: IpcContext, bytes: Uint8Array, fileName: string): Promise<string> {
  const session = await context.store.adopt(bytes, fileName);
  return session.id;
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

function stem(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '');
}

function partName(fileName: string, range: string, index: number): string {
  const label = range.trim().replace(/[^0-9a-z-]+/gi, '_');
  return `${stem(fileName)} ${label.length > 0 ? label : `part ${index + 1}`}.pdf`;
}

async function resolveSource(
  context: IpcContext,
  source: MergeSource
): Promise<MergeSourceDocument> {
  if (source.docId !== undefined) {
    return {
      name: context.store.session(source.docId).fileName,
      bytes: context.store.bytes(source.docId),
    };
  }
  if (source.filePath !== undefined) {
    return {
      name: basename(source.filePath),
      bytes: await readPdfFile(source.filePath),
    };
  }
  throw new Error('One of the files to combine has no open document and no path on disk.');
}

async function handleMerge(
  context: IpcContext,
  options: MergeOptions
): Promise<OpResult<MergeDetail>> {
  const sources = await Promise.all(
    options.sources.map((source) => resolveSource(context, source))
  );
  const result = await mergeDocuments(
    sources,
    { preserveBookmarks: options.preserveBookmarks },
    reporter(context, null, 'Combining files')
  );
  const docId = await adopt(context, result.bytes, 'Combined.pdf');
  return { ...result, detail: { ...result.detail, docId } };
}

async function handleSplit(
  context: IpcContext,
  docId: string,
  options: SplitOptions
): Promise<OpResult<SplitDetail>> {
  const fileName = context.store.session(docId).fileName;
  const result = await splitByRanges(
    context.store.bytes(docId),
    options.ranges,
    reporter(context, docId, 'Splitting')
  );
  const partDocIds: string[] = [];
  for (const [index, part] of result.detail.parts.entries()) {
    partDocIds.push(
      await adopt(context, part, partName(fileName, options.ranges[index] ?? '', index))
    );
  }
  return {
    bytes: result.bytes,
    pagesIn: result.pagesIn,
    pagesOut: result.pagesOut,
    detail: { partDocIds, partPageCounts: result.detail.partPageCounts },
  };
}

async function handleExtract(
  context: IpcContext,
  docId: string,
  options: ExtractOptions
): Promise<OpResult<ExtractDetail>> {
  const fileName = context.store.session(docId).fileName;
  const result = await extractPages(
    context.store.bytes(docId),
    options,
    reporter(context, docId, 'Extracting pages')
  );
  // The source is only touched when the pages were MOVED out; `sourceBytes` is
  // the rebuilt document in that case and the untouched input otherwise.
  if (options.removeFromSource) await context.store.setBytes(docId, result.detail.sourceBytes);
  return {
    bytes: result.bytes,
    pagesIn: result.pagesIn,
    pagesOut: result.pagesOut,
    detail: {
      docId: await adopt(context, result.bytes, `${stem(fileName)} extracted.pdf`),
      extractedPages: result.detail.extractedPages,
      sourceRebuilt: options.removeFromSource,
      sourcePageCount: result.detail.sourcePageCount,
    },
  };
}

function registerAssemblyHandlers(context: IpcContext): void {
  ipcMain.handle(IPC.ops.merge, (_event, options: MergeOptions) => handleMerge(context, options));

  ipcMain.handle(IPC.ops.split, (_event, docId: string, options: SplitOptions) =>
    handleSplit(context, docId, options)
  );

  ipcMain.handle(IPC.ops.extract, (_event, docId: string, options: ExtractOptions) =>
    handleExtract(context, docId, options)
  );
}

function registerPageHandlers(context: IpcContext): void {
  ipcMain.handle(IPC.ops.reorder, async (_event, docId: string, options: ReorderOptions) =>
    keep(
      context,
      docId,
      await reorderPages(
        context.store.bytes(docId),
        options,
        reporter(context, docId, 'Reordering')
      )
    )
  );

  ipcMain.handle(IPC.ops.rotate, async (_event, docId: string, options: RotateOptions) =>
    keep(
      context,
      docId,
      await rotatePages(context.store.bytes(docId), options, reporter(context, docId, 'Rotating'))
    )
  );

  ipcMain.handle(IPC.ops.delete, async (_event, docId: string, options: DeletePagesOptions) =>
    keep(
      context,
      docId,
      await deletePages(
        context.store.bytes(docId),
        options,
        reporter(context, docId, 'Removing pages')
      )
    )
  );

  ipcMain.handle(IPC.ops.insertBlank, async (_event, docId: string, options: InsertBlankOptions) =>
    keep(context, docId, await insertBlankPages(context.store.bytes(docId), options))
  );

  ipcMain.handle(IPC.ops.insertFrom, (_event, docId: string, options: InsertFromOptions) =>
    handleInsertFrom(context, docId, options)
  );
}

async function handleInsertFrom(
  context: IpcContext,
  docId: string,
  options: InsertFromOptions
): Promise<OpResult> {
  const sourceBytes = await readPdfFile(options.sourceFilePath);
  const settings = {
    atPage: options.atPage,
    sourceBytes,
    ...(options.sourcePages === undefined ? {} : { sourcePages: options.sourcePages }),
  };
  const result = await insertPagesFrom(
    context.store.bytes(docId),
    settings,
    reporter(context, docId, 'Inserting pages')
  );
  return keep(context, docId, result);
}

function registerDocumentHandlers(context: IpcContext): void {
  ipcMain.handle(IPC.ops.bookmarksGet, (_event, docId: string): Promise<BookmarkNode[]> => {
    return getBookmarks(context.store.bytes(docId));
  });

  ipcMain.handle(IPC.ops.bookmarksSet, async (_event, docId: string, tree: BookmarkNode[]) =>
    keep(context, docId, await setBookmarks(context.store.bytes(docId), tree))
  );

  ipcMain.handle(
    IPC.ops.scrubMetadata,
    async (_event, docId: string, options: ScrubMetadataOptions): Promise<OpResult<ScrubDetail>> =>
      keep(context, docId, await scrubMetadata(context.store.bytes(docId), options))
  );

  ipcMain.handle(
    IPC.ops.flatten,
    async (_event, docId: string, options: FlattenOptions): Promise<OpResult<FlattenDetail>> =>
      keep(
        context,
        docId,
        await flattenAnnotations(
          context.store.bytes(docId),
          options,
          reporter(context, docId, 'Flattening annotations')
        )
      )
  );

  ipcMain.handle(
    IPC.ops.fillForm,
    async (_event, docId: string, options: FillFormOptions): Promise<OpResult<FillFormDetail>> =>
      keep(
        context,
        docId,
        await fillFormFields(
          context.store.bytes(docId),
          options,
          reporter(context, docId, 'Filling form fields')
        )
      )
  );
}

export function registerOpsHandlers(context: IpcContext): void {
  registerAssemblyHandlers(context);
  registerPageHandlers(context);
  registerDocumentHandlers(context);
}

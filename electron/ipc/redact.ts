// #seam:ipc-contract
/**
 * LANE E (redaction) — owned by the redaction agent.
 * Apply DESTROYS content: rasterize the affected pages, burn the boxes in, and
 * rebuild. The verify pass must re-extract text and prove the marked strings
 * are gone before the result is ever presented as a success.
 *
 * Two rules this file exists to keep:
 *   - Nothing unverified escapes. `applyRedactions` throws on a failed proof,
 *     and the second pass (after an optional re-OCR) is asserted here as well.
 *     There is no path from a failed verification to an adopted document.
 *   - The source file is never touched. The output is adopted as a NEW store
 *     document with no path on disk, so the only way to keep it is Save As.
 */

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  OpResult,
  ProgressEvent,
  RedactApplyOptions,
  RedactVerifyResult,
} from '@shared/types';
import { applyRedactions, assertVerified, verifyRedaction } from '@core/redact';
import type { RedactProgress } from '@core/redact';
import type { IpcContext } from './context';
import { reOcrBurnedPages } from './redact-reocr';

// #seam:redact-new-document
/**
 * Redaction always produces a WHOLE NEW document, and `RedactVerifyResult` has
 * no field to carry its store id, so main adopts the document and announces it
 * on `redact:progress` under this phase. The renderer half carries the same
 * marker and the same phrase: src/features/redact/redacted-document.ts, whose
 * test fails if the two ever drift.
 */
export const REDACTED_DOCUMENT_PHASE = 'Redacted document ready';

/** Suffix that tells the attorney at a glance which tab is the redacted one. */
export function redactedFileName(fileName: string): string {
  return `${fileName.replace(/\.pdf$/i, '')} (redacted).pdf`;
}

function reporter(context: IpcContext, docId: string): RedactProgress {
  return (phase, current, total, message) => {
    const event: ProgressEvent =
      message === undefined
        ? { docId, phase, current, total }
        : { docId, phase, current, total, message };
    context.emitProgress(IPC.redact.progress, event);
  };
}

async function rasterizeThrough(
  context: IpcContext,
  docId: string,
  page: number,
  dpi: number
): Promise<{ png: Uint8Array; widthPx: number; heightPx: number }> {
  const response = await context.requestRaster({ docId, page, dpi });
  if (response.png === null || response.png.byteLength === 0) {
    throw new Error(`Page ${page} could not be rasterized, so it was not redacted.`);
  }
  return { png: response.png, widthPx: response.widthPx, heightPx: response.heightPx };
}

/**
 * Re-OCR writes brand new text onto the rebuilt pages, so the proof has to be
 * repeated against the bytes the user will actually receive.
 */
async function verifyAgainAfterOcr(
  bytes: Uint8Array,
  strings: readonly string[],
  pages: readonly number[],
  instancesDestroyed: number
): Promise<RedactVerifyResult> {
  const result = await verifyRedaction({
    bytes,
    strings,
    pagesRebuilt: pages,
    expectNoTextOnRebuiltPages: false,
    instancesDestroyed,
  });
  assertVerified(result);
  return result;
}

async function announce(context: IpcContext, bytes: Uint8Array, fileName: string): Promise<void> {
  const session = await context.store.adopt(bytes, redactedFileName(fileName));
  context.emitProgress(IPC.redact.progress, {
    docId: session.id,
    phase: REDACTED_DOCUMENT_PHASE,
    current: session.pageCount,
    total: session.pageCount,
    message: session.fileName,
  });
}

async function handleApply(
  context: IpcContext,
  docId: string,
  options: RedactApplyOptions
): Promise<OpResult<RedactVerifyResult>> {
  const fileName = context.store.session(docId).fileName;
  const outcome = await applyRedactions(context.store.bytes(docId), options, {
    rasterize: (page, dpi) => rasterizeThrough(context, docId, page, dpi),
    onProgress: reporter(context, docId),
  });

  if (!options.reOcr) {
    await announce(context, outcome.result.bytes, fileName);
    return outcome.result;
  }

  const searchable = await reOcrBurnedPages(
    context,
    docId,
    outcome.result.bytes,
    outcome.burned,
    options.dpi
  );
  const receipt = await verifyAgainAfterOcr(
    searchable,
    outcome.plan.strings,
    outcome.plan.pages,
    outcome.plan.instanceCount
  );
  await announce(context, searchable, fileName);
  return {
    bytes: searchable,
    pagesIn: outcome.result.pagesIn,
    pagesOut: outcome.result.pagesOut,
    detail: receipt,
  };
}

/**
 * The standalone check the panel offers on any open document: prove these
 * strings are absent. It rebuilds nothing, so it destroys nothing.
 */
function handleVerify(
  context: IpcContext,
  docId: string,
  strings: string[]
): Promise<RedactVerifyResult> {
  return verifyRedaction({
    bytes: context.store.bytes(docId),
    strings,
    pagesRebuilt: [],
    expectNoTextOnRebuiltPages: false,
    instancesDestroyed: 0,
  });
}

export function registerRedactHandlers(context: IpcContext): void {
  ipcMain.handle(IPC.redact.apply, (_event, docId: string, options: RedactApplyOptions) =>
    handleApply(context, docId, options)
  );

  ipcMain.handle(IPC.redact.verify, (_event, docId: string, strings: string[]) =>
    handleVerify(context, docId, strings)
  );
}

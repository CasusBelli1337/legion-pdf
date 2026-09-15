/**
 * Stopping an export half way through.
 *
 * A cancelled run is a FAILURE, never a short result: the promise rejects, so
 * no caller can mistake three pages for the sixty-five that were asked for. The
 * files already on disk are kept — deleting an attorney's work because they
 * changed their mind would be worse — and the message says exactly how many
 * there are, so the receipt and the folder agree.
 */

export class ExportCancelledError extends Error {
  readonly code = 'EXPORT_CANCELLED';
  constructor(
    readonly pagesDone: number,
    readonly filesKept: number
  ) {
    super(cancelMessage(pagesDone, filesKept));
    this.name = 'ExportCancelledError';
  }
}

/** Plain English, and specific: the attorney has to know what is in the folder. */
export function cancelMessage(pagesDone: number, filesKept: number): string {
  if (pagesDone === 0) return 'Export was stopped before any page was written.';
  const kept =
    filesKept === 0
      ? 'No file was written.'
      : `${filesKept} ${filesKept === 1 ? 'file was' : 'files were'} kept.`;
  return `Export was stopped after page ${pagesDone}. ${kept}`;
}

/** True for the error itself and for the copy that survives the IPC boundary. */
export function isExportCancelled(value: unknown): boolean {
  return (
    value instanceof ExportCancelledError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { code?: unknown }).code === 'EXPORT_CANCELLED')
  );
}

/** Checked before every page, so Cancel lands within one page rather than at the end. */
export function assertNotCancelled(
  signal: AbortSignal,
  pagesDone: number,
  filesKept: number
): void {
  if (signal.aborted) throw new ExportCancelledError(pagesDone, filesKept);
}

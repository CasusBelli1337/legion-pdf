/**
 * Every word the "OCR multiple files" section says. Pure functions, so the copy
 * an attorney reads is unit-tested rather than eyeballed.
 */

import type { BulkOcrFileResult, ProgressEvent } from '@shared/types';
import { groupDigits } from './ocr-messages';

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/** Everything after the last slash or backslash — Windows and WSL paths both. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** The folder a path sits in, or '' when there is nothing before the name. */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return cut <= 0 ? '' : path.slice(0, cut);
}

/** "3 files chosen" — what the picker button reports back. */
export function chosenSummary(paths: readonly string[]): string {
  if (paths.length === 0) return 'No files chosen yet.';
  return `${groupDigits(paths.length)} ${plural(paths.length, 'file')} chosen.`;
}

export function outputFolderLabel(outputDir: string | null): string {
  return outputDir === null ? 'Beside the original files' : outputDir;
}

/** "File 2 of 5" — the counter that proves a long run is moving. */
export function fileCounter(event: ProgressEvent | null): string {
  if (event === null || event.total === 0) return '';
  return `File ${groupDigits(Math.min(event.current, event.total))} of ${groupDigits(event.total)}`;
}

export type LiveStatus = 'waiting' | 'working' | 'finished';

/**
 * What one file shows WHILE the run is going. Only the file in flight can be
 * described precisely; the ones behind it are "finished" and wait for the
 * receipt to say how they finished, which is the only honest answer.
 */
export function liveStatusLabel(status: LiveStatus): string {
  return { waiting: 'Waiting', working: 'Working', finished: 'Finished' }[status];
}

/**
 * A file that was already searchable: recognized nothing, wrote nothing, and
 * succeeded. It is a 'done' row with no output file, which is exactly what the
 * runner records for "there was nothing to do here".
 */
export function isAlreadySearchable(file: BulkOcrFileResult): boolean {
  return file.status === 'done' && file.outputPath === null;
}

/** One row of the receipt, in the attorney's words. */
export function fileOutcome(file: BulkOcrFileResult): string {
  if (isAlreadySearchable(file)) return 'Already searchable — left alone.';
  if (file.status === 'done') {
    return `Saved ${fileNameOf(file.outputPath ?? '')} — ${groupDigits(file.pages)} ${plural(
      file.pages,
      'page'
    )}, ${groupDigits(file.words)} ${plural(file.words, 'word')}.`;
  }
  if (file.status === 'cancelled') return 'Not started — the run was cancelled.';
  return file.error ?? 'Text recognition could not finish this file.';
}

/** The headline over the receipt table. Never hides a failure. */
export function bulkReceipt(files: readonly BulkOcrFileResult[]): string {
  const saved = files.filter((file) => file.status === 'done' && file.outputPath !== null).length;
  const untouched = files.filter(isAlreadySearchable).length;
  const failed = files.filter((file) => file.status === 'failed').length;
  const cancelled = files.filter((file) => file.status === 'cancelled').length;

  const parts = [`${groupDigits(saved)} searchable ${plural(saved, 'copy', 'copies')} saved`];
  if (untouched > 0) parts.push(`${groupDigits(untouched)} already searchable`);
  if (failed > 0) parts.push(`${groupDigits(failed)} failed`);
  if (cancelled > 0) parts.push(`${groupDigits(cancelled)} not started`);
  return `${parts.join(', ')}.`;
}

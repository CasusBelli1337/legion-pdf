/**
 * Every word the OCR panel says, in one place — plain English for an attorney,
 * no jargon, no emojis. Pure functions so the copy is unit-tested rather than
 * eyeballed.
 */

import type { OcrDetectResult, OcrRunDetail, ProgressEvent } from '@shared/types';

/** Mirrors the sentinel the main process puts in a cancelled run's message. */
const CANCELLED = 'OCR_CANCELLED';

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/** Thousands separators — "48,213 characters" reads, "48213" does not. */
export function groupDigits(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** The headline the panel opens with, e.g. "214 of 214 pages need text recognition." */
export function detectSummary(result: OcrDetectResult): string {
  if (result.pageCount === 0) return 'This document has no pages.';
  const needing = result.pagesNeedingOcr.length;
  if (needing === 0) {
    return `All ${groupDigits(result.pageCount)} ${plural(
      result.pageCount,
      'page'
    )} already ${plural(result.pageCount, 'has', 'have')} searchable text.`;
  }
  return `${groupDigits(needing)} of ${groupDigits(result.pageCount)} ${plural(
    result.pageCount,
    'page'
  )} ${plural(needing, 'needs', 'need')} text recognition.`;
}

/** The button label — always says exactly what will happen. */
export function runButtonLabel(result: OcrDetectResult | null): string {
  const needing = result?.pagesNeedingOcr.length ?? 0;
  if (needing === 0) return 'Nothing to recognize';
  return `Recognize text on ${groupDigits(needing)} ${plural(needing, 'page')}`;
}

/** "Page 37 of 214" — the counter that proves the run is moving. */
export function pageLabel(event: ProgressEvent | null): string {
  if (event === null || event.total === 0) return '';
  return `Page ${groupDigits(Math.min(event.current, event.total))} of ${groupDigits(event.total)}`;
}

export function percentComplete(event: ProgressEvent | null): number {
  if (event === null || event.total === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((event.current / event.total) * 100)));
}

/** The completion receipt: what was done, in counts the user can check. */
export function runReceipt(detail: OcrRunDetail): string {
  const pages = detail.pagesOcred.length;
  const characters = detail.charsPerPage.reduce((total, count) => total + count, 0);
  return `Added searchable text to ${groupDigits(pages)} ${plural(
    pages,
    'page'
  )} — ${groupDigits(characters)} ${plural(characters, 'character')} recognized.`;
}

/** True when the run stopped because the user pressed Cancel. */
export function isCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(CANCELLED);
}

/**
 * Electron wraps a handler's error in "Error invoking remote method '...':".
 * The attorney sees the sentence, never the plumbing.
 */
export function plainError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^[A-Za-z]*Error:\s*/, '')
    .trim();
}

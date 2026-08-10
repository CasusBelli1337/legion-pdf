// #seam:centurion-ask-payload - the main-process half is electron/services/anthropic.ts
/**
 * The context selector and the request it produces. `AiAskRequest` in shared/
 * does not carry the document text yet, so the panel adds `documentText` and
 * `contextLabel`; the main process reads them back through `readAskPayload`.
 * Shared-type change requested: fold both fields into `AiAskRequest`.
 */

import type { AiAskRequest, AiMessage } from '@shared/types';

/** How much of the document goes to Claude. */
export type ContextMode = 'whole' | 'range' | 'current';

/** Generous by design: a max_tokens stop is a failure, so the ceiling starts high. */
export const DEFAULT_MAX_TOKENS = 8192;

export interface CenturionAskPayload extends AiAskRequest {
  documentText: string;
  contextLabel: string;
}

export interface ContextSelection {
  mode: ContextMode;
  /** 1-based, inclusive. Only read in 'range' mode. */
  from: number;
  to: number;
  currentPage: number;
  pageCount: number;
}

/** Clamp a page into the document, so a typed range can never collapse to nothing. */
function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, pageCount));
}

/**
 * The pages the selection resolves to, or `undefined` for the whole document.
 * A reversed range is normalised rather than rejected - the attorney typed a
 * range, not a bug report.
 */
export function selectedPages(selection: ContextSelection): number[] | undefined {
  const { mode, pageCount } = selection;
  if (mode === 'whole') return undefined;
  if (mode === 'current') return [clampPage(selection.currentPage, pageCount)];
  const first = clampPage(selection.from, pageCount);
  const last = clampPage(selection.to, pageCount);
  const [low, high] = first <= last ? [first, last] : [last, first];
  return Array.from({ length: high - low + 1 }, (_unused, index) => low + index);
}

/** Plain English for the prompt and for the panel's own context line. */
export function contextLabel(selection: ContextSelection): string {
  const pages = selectedPages(selection);
  if (pages === undefined) return `the whole document, pages 1-${selection.pageCount}`;
  const first = pages[0] ?? 1;
  const last = pages[pages.length - 1] ?? first;
  return first === last
    ? `page ${first} of ${selection.pageCount}`
    : `pages ${first}-${last} of ${selection.pageCount}`;
}

export function buildAskPayload(
  docId: string,
  messages: AiMessage[],
  selection: ContextSelection,
  documentText: string
): CenturionAskPayload {
  const pages = selectedPages(selection);
  return {
    docId,
    messages,
    ...(pages === undefined ? {} : { contextPages: pages }),
    maxTokens: DEFAULT_MAX_TOKENS,
    documentText,
    contextLabel: contextLabel(selection),
  };
}

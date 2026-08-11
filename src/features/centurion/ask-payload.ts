/**
 * The context selector and the `AiAskRequest` it produces. The document text and
 * its plain-English label are part of the shared request type, so the panel and
 * the main process agree on the payload by compiling, not by convention.
 */

import type { AiAskRequest, AiMessage } from '@shared/types';

/** How much of the document goes to Claude. */
export type ContextMode = 'whole' | 'range' | 'current';

/** Generous by design: a max_tokens stop is a failure, so the ceiling starts high. */
export const DEFAULT_MAX_TOKENS = 8192;

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
  documentText: string,
  toolsEnabled: boolean
): AiAskRequest {
  const pages = selectedPages(selection);
  return {
    docId,
    messages,
    ...(pages === undefined ? {} : { contextPages: pages }),
    maxTokens: DEFAULT_MAX_TOKENS,
    documentText,
    contextLabel: contextLabel(selection),
    toolsEnabled,
  };
}

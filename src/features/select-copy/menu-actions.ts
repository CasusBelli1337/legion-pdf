/**
 * What the four items on the selection menu actually do, written as functions
 * over a payload and a set of injected dependencies rather than as click
 * handlers — so the clipboard string an attorney gets, and the marks a redact
 * produces, are unit tested rather than eyeballed once.
 *
 * Highlight and Redact both go through the lanes that already own them: the
 * stamp channel `stamp:highlight`, and the redaction store's `markMatches`,
 * which merges and pads the quads exactly the way a search-and-redact does.
 */

import type { HighlightOptions, TextMatch } from '@shared/types';
import { useRedactionStore } from '../redact/redaction-store';
import type { SelectionPayload } from './engine';

export interface SelectionActionDeps {
  writeText(text: string): Promise<void>;
  highlight(docId: string, options: HighlightOptions): Promise<unknown>;
  markRedactions(docId: string, matches: readonly TextMatch[]): void;
}

/**
 * Selection-derived matches take ordinals far above any search hit's, because
 * the redaction store derives mark ids from the ordinal and two marks sharing
 * an id is a mark the attorney cannot delete.
 */
const SELECTION_MATCH_BASE = 1_000_000;
let nextMatchIndex = SELECTION_MATCH_BASE;

/** The text plus its cite, the way it is pasted into a brief: `… (5:10-15)`. */
export function textWithCite(payload: SelectionPayload): string {
  return payload.cite === null ? payload.text : `${payload.text} ${payload.cite.formatted}`;
}

export async function copySelection(
  payload: SelectionPayload,
  deps: SelectionActionDeps
): Promise<void> {
  await deps.writeText(payload.text);
}

export async function copySelectionWithCite(
  payload: SelectionPayload,
  deps: SelectionActionDeps
): Promise<void> {
  await deps.writeText(textWithCite(payload));
}

/** One highlight call per page the selection crosses. Returns pages marked. */
export async function highlightSelection(
  payload: SelectionPayload,
  deps: SelectionActionDeps
): Promise<number> {
  let pages = 0;
  for (const page of payload.pages) {
    await deps.highlight(payload.docId, { page: page.page, rects: page.quads });
    pages += 1;
  }
  return pages;
}

/** The selection as redaction marks. Returns the number of marks handed over. */
export function redactSelection(payload: SelectionPayload, deps: SelectionActionDeps): number {
  const matches: TextMatch[] = payload.pages.map((page) => {
    nextMatchIndex += 1;
    return { page: page.page, text: page.text, index: nextMatchIndex, quads: page.quads };
  });
  deps.markRedactions(payload.docId, matches);
  return matches.reduce((total, match) => total + match.quads.length, 0);
}

/** The real wiring: the clipboard, the stamp channel, and the redaction store. */
export function liveActionDeps(): SelectionActionDeps {
  return {
    writeText: (text) => navigator.clipboard.writeText(text),
    highlight: (docId, options) => window.librarius.stamp.highlight(docId, options),
    markRedactions: (docId, matches) => {
      const store = useRedactionStore.getState();
      store.forDocument(docId);
      useRedactionStore.getState().markMatches(matches);
    },
  };
}

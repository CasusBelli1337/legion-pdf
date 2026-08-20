/**
 * What the four items on the selection menu actually do, written as functions
 * over a payload and a set of injected dependencies rather than as click
 * handlers — so the clipboard string an attorney gets, and the marks a redact
 * produces, are unit tested rather than eyeballed once.
 *
 * Highlight and Redact both go through the lanes that already own them: the
 * stamp channel `stamp:highlight`, and the redaction store's `markMatches`,
 * which merges and pads the quads exactly the way a search-and-redact does.
 *
 * Highlight also goes through the stamps lane's OP-COMPLETION path rather than
 * calling the channel and walking away. Calling the channel alone put the
 * highlight in the file while the screen, the dirty flag and Undo all said
 * nothing had happened — so closing the tab threw the work away with no
 * prompt (F-2). Redact needs none of this: it only adds marks to the panel and
 * touches no bytes until the attorney destroys them.
 */

import type { HighlightOptions, TextMatch } from '@shared/types';
import { runDocumentOp } from '../stamps/use-stamp-runner';
import { useRedactionStore } from '../redact/redaction-store';
import type { SelectionPayload } from './engine';

export interface SelectionActionDeps {
  writeText(text: string): Promise<void>;
  highlight(docId: string, options: HighlightOptions): Promise<unknown>;
  markRedactions(docId: string, matches: readonly TextMatch[]): void;
  /** Runs an edit and settles it: new bytes on screen, receipt, dirty, undo. */
  runOp(docId: string, label: string, work: () => Promise<string>): Promise<unknown>;
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

/** The receipt an attorney reads in the footer once the highlight has landed. */
export function highlightReceipt(areas: number, pages: readonly number[]): string {
  const what = areas === 1 ? '1 area' : `${areas} areas`;
  const where = pages.length === 1 ? `page ${pages[0]}` : `${pages.length} pages`;
  return `Highlighted ${what} on ${where}. Save the document to keep it.`;
}

/**
 * One highlight call per page the selection crosses, all of them inside a
 * single completion so the viewer re-reads the document once. Returns pages
 * marked.
 */
export async function highlightSelection(
  payload: SelectionPayload,
  deps: SelectionActionDeps
): Promise<number> {
  let pages = 0;
  let areas = 0;
  await deps.runOp(payload.docId, 'Highlighting the selection', async () => {
    for (const page of payload.pages) {
      await deps.highlight(payload.docId, { page: page.page, rects: page.quads });
      pages += 1;
      areas += page.quads.length;
    }
    return highlightReceipt(
      areas,
      payload.pages.map((page) => page.page)
    );
  });
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
    runOp: runDocumentOp,
  };
}

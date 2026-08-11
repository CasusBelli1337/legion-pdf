/**
 * The one tool Centurion does NOT get to run against the file: redaction.
 *
 * An approved `suggestRedactions` call is executed here, in the renderer, and
 * all it does is MARK. Each term goes through the viewer's own text search —
 * the same path the Redaction panel's search box uses — and the hits become
 * marks in the redaction store. Marked state is reversible; destruction is not,
 * so the attorney reviews the marks and presses Apply himself (engineering rule
 * 2: redaction is destruction, and destruction is never automatic).
 *
 * The count of marks actually created is what Centurion is told back, so it can
 * report honestly instead of assuming its terms were found.
 */

import type { RedactionTerm } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
// Deep import on purpose: the redaction lane's public surface is its panel, and
// the marks store is the seam this handshake was designed against.
import { useRedactionStore } from '@renderer/features/redact/redaction-store';

export interface MarkOutcome {
  /** New marks added to the panel — duplicates of existing marks are not counted. */
  marksCreated: number;
  /** Terms with at least one hit in the document. */
  termsFound: number;
  termsSearched: number;
  /** Terms the viewer could not find, quoted exactly as Centurion wrote them. */
  missing: string[];
  /** The sentence quoted back to Centurion and shown on the card. */
  detail: string;
}

const NOTHING_DESTROYED =
  'Nothing has been destroyed: the marks are in the Redaction panel for review, and the attorney applies the redaction himself.';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function describeOutcome(outcome: Omit<MarkOutcome, 'detail'>): string {
  const missing =
    outcome.missing.length === 0
      ? ''
      : ` Not found in this document: ${outcome.missing.map((term) => `"${term}"`).join(', ')}.`;
  if (outcome.marksCreated === 0) {
    return `None of the ${plural(outcome.termsSearched, 'term')} were found, so nothing was marked.${missing}`;
  }
  return `Marked ${plural(outcome.marksCreated, 'instance')} of ${plural(outcome.termsFound, 'term')}. ${NOTHING_DESTROYED}${missing}`;
}

/**
 * Marks every instance of every term. Returns what really happened — a term the
 * viewer could not find is reported, never quietly dropped.
 */
export async function markSuggestedTerms(
  api: ViewerApi,
  terms: readonly RedactionTerm[]
): Promise<MarkOutcome> {
  const store = useRedactionStore.getState();
  // Marks are keyed to a document; claiming this one first stops the panel from
  // clearing them the moment it opens.
  store.forDocument(api.docId);
  const before = useRedactionStore.getState().marks.length;

  const missing: string[] = [];
  let termsFound = 0;
  for (const term of terms) {
    const matches = await api.findText(term.text);
    if (matches.length === 0) {
      missing.push(term.text);
      continue;
    }
    termsFound += 1;
    useRedactionStore.getState().markMatches(matches);
  }

  const counted = {
    marksCreated: useRedactionStore.getState().marks.length - before,
    termsFound,
    termsSearched: terms.length,
    missing,
  };
  return { ...counted, detail: describeOutcome(counted) };
}

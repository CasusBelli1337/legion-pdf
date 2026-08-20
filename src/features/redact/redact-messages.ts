/**
 * Every word the redaction panel says, in one place — plain English for an
 * attorney, no jargon and no emojis. Pure functions so the copy that carries the
 * most consequence in this app is unit tested rather than eyeballed.
 */

import type { ProgressEvent, RedactVerifyResult, RedactedTerm, TextMatch } from '@shared/types';
import { PRODUCT_NAME } from '@shared/product';

/**
 * Everything that can go wrong with a redaction, kept apart so the sentence the
 * attorney reads names the real cause. An unmarked copy of a marked term
 * elsewhere in the document is NOT one of these: it is not a failure.
 */
export interface RedactionFindings {
  /** Terms whose marked copies did not disappear. */
  survivingStrings: readonly string[];
  /** Text still readable INSIDE a rectangle the attorney marked. */
  textInMarkedAreas: readonly string[];
  /** Rebuilt pages that still draw text when they should not. */
  pagesStillCarryingText: readonly number[];
}

/** The sentence that must appear before anything is destroyed. */
export const DESTRUCTION_WARNING =
  'This permanently destroys the marked content. It cannot be undone.';

/** The searchable-output choice, stated in both directions so neither is a surprise. */
export const SEARCHABLE_LABEL = 'Keep the redacted pages searchable';

export const SEARCHABLE_HINT =
  `On: ${PRODUCT_NAME} reads the blacked-out pages back with text recognition, so the rest of each ` +
  'page can still be searched and copied. Off: those pages become a picture, and nothing on ' +
  'them can be searched or copied. Either way the marked text is destroyed and cannot come back.';

/** What happens to the file on disk — the other half of the promise. */
export const SAVE_AS_NOTICE =
  'The redacted document opens in a new tab. Your original file is left exactly as it is until ' +
  'you save the new one.';

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function groupDigits(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** "Rasterizing page 3 of 7", or just the phase when there is nothing to count. */
export function progressLabel(event: ProgressEvent | null): string {
  if (event === null) return 'Starting';
  if (event.total <= 1) return `${event.phase}…`;
  return `${event.phase} ${groupDigits(Math.min(event.current, event.total))} of ${groupDigits(
    event.total
  )}`;
}

export function percentComplete(event: ProgressEvent | null): number {
  if (event === null || event.total === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((event.current / event.total) * 100)));
}

interface TermTotals {
  /** Terms accounted for. */
  terms: number;
  /** Occurrences the source held, across every term. */
  before: number;
  /** Occurrences that really disappeared. */
  destroyed: number;
  /** Occurrences still readable, because they were never marked. */
  remaining: number;
}

function totalsOf(terms: readonly RedactedTerm[] = []): TermTotals {
  return terms.reduce<TermTotals>(
    (totals, term) => ({
      terms: totals.terms + 1,
      before: totals.before + term.before,
      destroyed: totals.destroyed + Math.max(0, term.before - term.remaining),
      remaining: totals.remaining + term.remaining,
    }),
    { terms: 0, before: 0, destroyed: 0, remaining: 0 }
  );
}

function termCountPhrase(count: number): string {
  return count === 1 ? 'one term' : `${groupDigits(count)} terms`;
}

/**
 * The receipt.
 *
 * With everything gone it reads "Redaction verified — 3 instances destroyed on
 * 2 pages." When copies the attorney did NOT mark are still in the document it
 * says so in the same breath, because a receipt that implies a term is gone
 * document-wide is a receipt that cannot be quoted in a declaration.
 */
export function receiptText(result: RedactVerifyResult): string {
  const pages = result.pagesRebuilt.length;
  const where = `on ${groupDigits(pages)} ${plural(pages, 'page')}`;
  const totals = totalsOf(result.terms);
  if (totals.remaining === 0) {
    const instances = result.instancesDestroyed;
    return (
      `Redaction verified — ${groupDigits(instances)} ${plural(instances, 'instance')} ` +
      `destroyed ${where}.`
    );
  }
  return (
    `Redaction verified — ${groupDigits(totals.destroyed)} of ${groupDigits(totals.before)} ` +
    `instances of ${termCountPhrase(totals.terms)} destroyed ${where}. ` +
    `${groupDigits(totals.remaining)} unmarked ${plural(totals.remaining, 'instance')} ` +
    `${totals.remaining === 1 ? 'remains' : 'remain'} elsewhere in the document.`
  );
}

/** What the receipt says underneath: exactly which proof was run. */
export function proofText(result: RedactVerifyResult): string {
  const pages = result.pagesRebuilt.length;
  const proof =
    `${PRODUCT_NAME} re-opened the saved document, searched every stream in the file, and read the ` +
    `text back off ${groupDigits(pages)} rebuilt ${plural(pages, 'page')}.`;
  if (totalsOf(result.terms).remaining === 0) return `${proof} The marked text is not there.`;
  return (
    `${proof} The copies you marked are gone. The copies you did not mark were left exactly as ` +
    'they were — search for the term again if you want those destroyed too.'
  );
}

function joinClauses(clauses: readonly string[]): string {
  if (clauses.length <= 2) return clauses.join(' and ');
  return `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1] ?? ''}`;
}

/** One clause per failure kind, so the sentence names the real cause. */
function failureClauses(findings: RedactionFindings): string[] {
  const { survivingStrings: terms, textInMarkedAreas: areas, pagesStillCarryingText } = findings;
  const clauses: string[] = [];
  if (terms.length > 0) {
    clauses.push(
      `the marked copies of ${groupDigits(terms.length)} ${plural(terms.length, 'term')} ` +
        `are still readable (${terms.join(', ')})`
    );
  }
  if (areas.length > 0) {
    clauses.push(
      `${groupDigits(areas.length)} marked ${plural(areas.length, 'area')} ` +
        `${plural(areas.length, 'still shows', 'still show')} text (${areas.join(', ')})`
    );
  }
  if (pagesStillCarryingText.length > 0) {
    clauses.push(
      `${plural(pagesStillCarryingText.length, 'page', 'pages')} ` +
        `${pagesStillCarryingText.map(groupDigits).join(', ')} still ` +
        `${plural(pagesStillCarryingText.length, 'carries', 'carry')} text`
    );
  }
  return clauses;
}

/**
 * The loud failure. Never softened: an unverified redaction is not a result.
 * The three failure kinds read differently because they mean different things —
 * marked copies that did not die, a marked rectangle that still shows its text,
 * and a page that was not really rebuilt. None of them is an unmarked copy of
 * the term somewhere else, which is not a failure at all.
 */
export function failureText(findings: RedactionFindings): string {
  const clauses = failureClauses(findings);
  if (clauses.length === 0) {
    return 'The redaction could not be verified, so nothing was changed.';
  }
  return (
    `The redaction was NOT applied: ${joinClauses(clauses)} in the rebuilt document. ` +
    'Your document was not changed.'
  );
}

/* ── consent: the words between a mark and destruction ───────────────── */

/** The heading on the panel's confirmation. A question, so "Cancel" is an answer. */
export const DESTROY_HEADING = 'Permanently destroy the marked content?';

/** Exactly what is about to happen, counted, in the attorney's own terms. */
export function destroyQuestion(count: number, pages: number): string {
  return (
    `${groupDigits(count)} marked ${plural(count, 'area')} on ${groupDigits(pages)} ` +
    `${plural(pages, 'page')} will be blacked out and destroyed. This cannot be undone — not ` +
    'even with Undo.'
  );
}

export const DESTROY_CONFIRM_LABEL = 'Destroy and redact';

/** What Cancel means, said plainly so nobody has to guess. */
export const DESTROY_CANCEL_NOTE =
  'Cancel keeps every mark exactly where it is, and destroys nothing.';

/** The save-time gate's heading: the plain fact that stopped the save. */
export function pendingMarksHeading(count: number): string {
  const marks = `${groupDigits(count)} redaction ${plural(count, 'mark')}`;
  const clause = count === 1 ? 'that has not been applied' : 'that have not been applied';
  return `This document has ${marks} ${clause}.`;
}

/**
 * What "Apply redactions now" does — including WHICH FILE ENDS UP WHERE, which
 * is the one thing on this dialog an attorney cannot afford to misread.
 */
export function applyNowExplanation(count: number, pages: number): string {
  return (
    `Apply redactions now: the ${groupDigits(count)} marked ${plural(count, 'area')} on ` +
    `${groupDigits(pages)} ${plural(pages, 'page')} will be blacked out and destroyed, and you ` +
    'will be asked where to save the redacted copy. This cannot be undone — not even with Undo. ' +
    'The redacted copy will be saved; your original stays open unredacted.'
  );
}

export const SAVE_WITHOUT_REDACTING_EXPLANATION =
  'Save without redacting: the document is saved exactly as it looks now. The marks stay where ' +
  'they are, ready to apply later, and nothing is destroyed.';

export const REDACTION_GATE_CANCEL_NOTE = 'Cancel goes back to the document and saves nothing.';

export const APPLY_NOW_LABEL = 'Apply redactions now';
export const SAVE_WITHOUT_REDACTING_LABEL = 'Save without redacting';

/** Said once the redacted copy is on disk: two documents are open, only one saved. */
export function redactedCopySaved(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return (
    `The redacted copy is saved as ${name}. Your original document is still open, unredacted, ` +
    'and was not saved.'
  );
}

/** Backing out of the location dialog leaves the redacted document unsaved, loudly. */
export const REDACTED_COPY_NOT_SAVED =
  'The redacted document is open in a new tab and has not been saved anywhere yet. Your original ' +
  'document was not saved either.';

/** A redaction that failed on the way to a save. Never softened, never silent. */
export const REDACTION_NOT_APPLIED_AT_SAVE =
  'The redaction could not be applied, so nothing was saved. Your document was not changed.';

export function markSummary(count: number): string {
  if (count === 0) return 'Nothing is marked yet.';
  return `${groupDigits(count)} ${plural(count, 'mark')} ready to destroy.`;
}

export function applyButtonLabel(count: number): string {
  if (count === 0) return 'Nothing marked yet';
  return `Redact and destroy ${groupDigits(count)} ${plural(count, 'mark')}`;
}

export function searchSummary(matches: readonly TextMatch[], searched: boolean): string {
  if (!searched) return 'Search the document to mark every instance of a term at once.';
  if (matches.length === 0) return 'No instances of that term were found.';
  const pages = new Set(matches.map((match) => match.page)).size;
  return `${groupDigits(matches.length)} ${plural(matches.length, 'instance')} on ${groupDigits(
    pages
  )} ${plural(pages, 'page')}.`;
}

export function markAllLabel(matches: readonly TextMatch[]): string {
  return `Mark all ${groupDigits(matches.length)} ${plural(matches.length, 'instance')}`;
}

/** A one-line description of a mark for the list in the panel. */
export function markLabel(page: number, snippet: string | undefined): string {
  const where = `Page ${groupDigits(page)}`;
  const trimmed = snippet?.trim() ?? '';
  if (trimmed.length === 0) return `${where} — box drawn by hand`;
  return `${where} — "${trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed}"`;
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

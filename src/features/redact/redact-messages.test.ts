import { describe, expect, it } from 'vitest';
import type { RedactVerifyResult, TextMatch } from '@shared/types';
import {
  APPLY_NOW_LABEL,
  applyButtonLabel,
  applyNowExplanation,
  DESTROY_CANCEL_NOTE,
  DESTROY_CONFIRM_LABEL,
  DESTROY_HEADING,
  destroyQuestion,
  DESTRUCTION_WARNING,
  failureText,
  markAllLabel,
  markLabel,
  markSummary,
  pendingMarksHeading,
  percentComplete,
  plainError,
  progressLabel,
  proofText,
  receiptText,
  REDACTED_COPY_NOT_SAVED,
  redactedCopySaved,
  REDACTION_GATE_CANCEL_NOTE,
  REDACTION_NOT_APPLIED_AT_SAVE,
  SAVE_WITHOUT_REDACTING_EXPLANATION,
  SAVE_WITHOUT_REDACTING_LABEL,
  SEARCHABLE_HINT,
  SEARCHABLE_LABEL,
  searchSummary,
} from './redact-messages';

const VERIFIED: RedactVerifyResult = {
  verified: true,
  pagesRebuilt: [2, 5],
  instancesDestroyed: 3,
  survivingStrings: [],
  terms: [{ text: 'SSN 545-45-6789', before: 3, remaining: 0, marked: 3 }],
};

/** Two of five copies marked and destroyed; three the attorney left alone. */
const PARTLY_MARKED: RedactVerifyResult = {
  ...VERIFIED,
  instancesDestroyed: 2,
  terms: [{ text: 'SSN 545-45-6789', before: 5, remaining: 3, marked: 2 }],
};

const NOTHING_FOUND = {
  survivingStrings: [],
  textInMarkedAreas: [],
  pagesStillCarryingText: [],
};

describe('the warning', () => {
  it('says exactly what applying does, in plain English', () => {
    expect(DESTRUCTION_WARNING).toBe(
      'This permanently destroys the marked content. It cannot be undone.'
    );
  });
});

describe('progressLabel', () => {
  it('counts pages while the run moves', () => {
    expect(progressLabel({ docId: 'a', phase: 'Rasterizing page', current: 3, total: 7 })).toBe(
      'Rasterizing page 3 of 7'
    );
  });

  it('drops the counter for a step there is only one of', () => {
    expect(progressLabel({ docId: 'a', phase: 'Verifying', current: 1, total: 1 })).toBe(
      'Verifying…'
    );
  });

  it('never counts past the total', () => {
    expect(progressLabel({ docId: 'a', phase: 'Rasterizing page', current: 9, total: 7 })).toBe(
      'Rasterizing page 7 of 7'
    );
  });

  it('says something before the first event arrives', () => {
    expect(progressLabel(null)).toBe('Starting');
  });
});

describe('percentComplete', () => {
  it('reports a fraction of the whole run', () => {
    expect(percentComplete({ docId: 'a', phase: 'x', current: 1, total: 4 })).toBe(25);
  });

  it('reports nothing before the run starts', () => {
    expect(percentComplete(null)).toBe(0);
  });
});

describe('receiptText', () => {
  it('reads exactly as the acceptance criterion requires', () => {
    expect(receiptText(VERIFIED)).toBe('Redaction verified — 3 instances destroyed on 2 pages.');
  });

  it('uses the singular for one instance on one page', () => {
    expect(receiptText({ ...VERIFIED, instancesDestroyed: 1, pagesRebuilt: [4] })).toBe(
      'Redaction verified — 1 instance destroyed on 1 page.'
    );
  });

  it('groups big numbers so they can be read', () => {
    expect(receiptText({ ...VERIFIED, instancesDestroyed: 1234 })).toContain('1,234 instances');
  });

  /**
   * QA F-1. Marking one copy of a term the document holds five times is a
   * complete redaction, and the receipt has to say so without ever implying the
   * term itself is gone — this sentence may end up quoted in a declaration.
   */
  it('states plainly how many unmarked instances are still in the document', () => {
    expect(receiptText(PARTLY_MARKED)).toBe(
      'Redaction verified — 2 of 5 instances of one term destroyed on 2 pages. 3 unmarked ' +
        'instances remain elsewhere in the document.'
    );
  });

  it('uses the singular for a single copy left behind', () => {
    expect(
      receiptText({
        ...VERIFIED,
        instancesDestroyed: 1,
        pagesRebuilt: [1],
        terms: [{ text: 'SSN 545-45-6789', before: 2, remaining: 1, marked: 1 }],
      })
    ).toBe(
      'Redaction verified — 1 of 2 instances of one term destroyed on 1 page. 1 unmarked ' +
        'instance remains elsewhere in the document.'
    );
  });

  it('counts the terms when more than one was marked', () => {
    expect(
      receiptText({
        ...PARTLY_MARKED,
        terms: [
          { text: 'SSN 545-45-6789', before: 3, remaining: 2, marked: 1 },
          { text: 'ACCT-99887766', before: 2, remaining: 1, marked: 1 },
        ],
      })
    ).toContain('2 of 5 instances of 2 terms destroyed');
  });

  it('says which proof was run', () => {
    expect(proofText(VERIFIED)).toContain('re-opened the saved document');
    expect(proofText(VERIFIED)).toContain('The marked text is not there.');
  });

  it('never claims the whole term is gone when unmarked copies remain', () => {
    const proof = proofText(PARTLY_MARKED);
    expect(proof).toContain('The copies you marked are gone.');
    expect(proof).toContain('The copies you did not mark were left exactly as they were');
    expect(proof).not.toContain('The marked text is not there.');
  });
});

describe('failureText', () => {
  it('names the terms whose MARKED copies survived, and says nothing was changed', () => {
    const text = failureText({ ...NOTHING_FOUND, survivingStrings: ['SSN 545-45-6789'] });
    expect(text).toContain('NOT applied');
    expect(text).toContain('the marked copies of 1 term are still readable');
    expect(text).toContain('SSN 545-45-6789');
    expect(text).toContain('was not changed');
  });

  /** The wording the QA finding forced: never "still readable" for a twin. */
  it('blames the marked copies, never the term being in the document', () => {
    const text = failureText({ ...NOTHING_FOUND, survivingStrings: ['SSN 1', 'ACCT-2'] });
    expect(text).toContain('the marked copies of 2 terms are still readable');
  });

  it('names text still readable inside a marked area as its own failure', () => {
    const text = failureText({ ...NOTHING_FOUND, textInMarkedAreas: ['545-45-6789'] });
    expect(text).toContain('1 marked area still shows text (545-45-6789)');
  });

  it('names a page that was not really rebuilt, as its own failure', () => {
    const text = failureText({ ...NOTHING_FOUND, pagesStillCarryingText: [3] });
    expect(text).toContain('NOT applied');
    expect(text).toContain('page 3 still carries text');
  });

  it('reads correctly for several pages', () => {
    expect(failureText({ ...NOTHING_FOUND, pagesStillCarryingText: [2, 5] })).toContain(
      'pages 2, 5 still carry text'
    );
  });

  it('reports every failure kind together when they all happened', () => {
    const text = failureText({
      survivingStrings: ['SSN 1'],
      textInMarkedAreas: ['545-45'],
      pagesStillCarryingText: [4],
    });
    expect(text).toContain('the marked copies of 1 term are still readable');
    expect(text).toContain('1 marked area still shows text');
    expect(text).toContain('and page 4 still carries text');
  });

  it('still refuses loudly when it cannot name what survived', () => {
    expect(failureText(NOTHING_FOUND)).toContain('could not be verified');
  });
});

describe('panel copy', () => {
  it('tells the attorney how many marks are ready', () => {
    expect(markSummary(0)).toBe('Nothing is marked yet.');
    expect(markSummary(1)).toBe('1 mark ready to destroy.');
    expect(markSummary(4)).toBe('4 marks ready to destroy.');
  });

  it('puts the count on the button that destroys', () => {
    expect(applyButtonLabel(0)).toBe('Nothing marked yet');
    expect(applyButtonLabel(2)).toBe('Redact and destroy 2 marks');
  });

  it('distinguishes "no results" from "not searched yet"', () => {
    expect(searchSummary([], false)).toContain('Search the document');
    expect(searchSummary([], true)).toBe('No instances of that term were found.');
  });

  it('summarizes hits by instance and page', () => {
    const matches: TextMatch[] = [
      { page: 1, text: 'x', index: 0, quads: [] },
      { page: 1, text: 'x', index: 1, quads: [] },
      { page: 4, text: 'x', index: 2, quads: [] },
    ];
    expect(searchSummary(matches, true)).toBe('3 instances on 2 pages.');
    expect(markAllLabel(matches)).toBe('Mark all 3 instances');
  });

  it('labels a hand-drawn mark differently from a search hit', () => {
    expect(markLabel(3, undefined)).toBe('Page 3 — box drawn by hand');
    expect(markLabel(3, 'SSN 545-45-6789')).toBe('Page 3 — "SSN 545-45-6789"');
  });

  it('truncates a long snippet rather than breaking the list', () => {
    expect(markLabel(1, 'x'.repeat(80))).toHaveLength('Page 1 — ""'.length + 41);
  });
});

describe('plainError', () => {
  it('strips the Electron IPC wrapper', () => {
    expect(
      plainError(new Error("Error invoking remote method 'redact:apply': Nothing marked."))
    ).toBe('Nothing marked.');
  });

  it('strips a bare error class prefix', () => {
    expect(plainError('RangeError: page 9 does not exist')).toBe('page 9 does not exist');
  });
});

describe('the searchable-output copy', () => {
  it("names the choice in the attorney's words", () => {
    expect(SEARCHABLE_LABEL).toBe('Keep the redacted pages searchable');
  });

  // The default is ON, so the hint has to explain what turning it OFF costs —
  // not just what leaving it on gains.
  it('states the tradeoff in both directions', () => {
    expect(SEARCHABLE_HINT).toContain('On:');
    expect(SEARCHABLE_HINT).toContain('Off:');
    expect(SEARCHABLE_HINT).toContain('become a picture');
    expect(SEARCHABLE_HINT).toContain('searched and copied');
  });

  it('promises the destruction either way', () => {
    expect(SEARCHABLE_HINT).toContain('the marked text is destroyed and cannot come back');
  });
});

/**
 * The consent copy, pinned word for word. These are the sentences an attorney
 * reads immediately before content stops existing, and the only place the app
 * tells them WHICH FILE ends up where — so they are tested, not eyeballed.
 */
describe('the panel confirmation', () => {
  it('asks the question as a question', () => {
    expect(DESTROY_HEADING).toBe('Permanently destroy the marked content?');
    expect(DESTROY_CONFIRM_LABEL).toBe('Destroy and redact');
  });

  it('counts the marks and the pages, and says undo will not save them', () => {
    expect(destroyQuestion(3, 2)).toBe(
      '3 marked areas on 2 pages will be blacked out and destroyed. This cannot be undone — not ' +
        'even with Undo.'
    );
  });

  it('counts one mark on one page as one of each', () => {
    expect(destroyQuestion(1, 1)).toContain('1 marked area on 1 page will be');
  });

  it('says what backing out means', () => {
    expect(DESTROY_CANCEL_NOTE).toContain('destroys nothing');
  });
});

describe('the save-time gate copy', () => {
  it('states the plain fact that stopped the save', () => {
    expect(pendingMarksHeading(4)).toBe(
      'This document has 4 redaction marks that have not been applied.'
    );
    expect(pendingMarksHeading(1)).toBe(
      'This document has 1 redaction mark that has not been applied.'
    );
  });

  it('labels all three answers in plain English', () => {
    expect(APPLY_NOW_LABEL).toBe('Apply redactions now');
    expect(SAVE_WITHOUT_REDACTING_LABEL).toBe('Save without redacting');
    expect(REDACTION_GATE_CANCEL_NOTE).toContain('saves nothing');
  });

  /**
   * The sentence that decides whether an attorney knows what left the building.
   * Applying at save time saves the redacted COPY; the source stays open and
   * unredacted. If this line ever drifts, the dialog starts lying.
   */
  it('says which file gets saved and which one does not', () => {
    const text = applyNowExplanation(2, 1);
    expect(text).toContain('2 marked areas on 1 page will be blacked out and destroyed');
    expect(text).toContain('you will be asked where to save the redacted copy');
    expect(text).toContain('This cannot be undone — not even with Undo.');
    expect(text).toContain('The redacted copy will be saved; your original stays open unredacted.');
  });

  it('says that saving without redacting destroys nothing and keeps the marks', () => {
    expect(SAVE_WITHOUT_REDACTING_EXPLANATION).toContain('saved exactly as it looks now');
    expect(SAVE_WITHOUT_REDACTING_EXPLANATION).toContain('marks stay where they are');
    expect(SAVE_WITHOUT_REDACTING_EXPLANATION).toContain('nothing is destroyed');
  });
});

describe('what the attorney is told afterwards', () => {
  it('names the redacted copy and says the original was not saved', () => {
    const notice = redactedCopySaved('C:\\Matters\\Smith\\Depo (redacted).pdf');
    expect(notice).toContain('saved as Depo (redacted).pdf');
    expect(notice).toContain('still open, unredacted, and was not saved');
  });

  it('is loud when the location dialog is backed out of', () => {
    expect(REDACTED_COPY_NOT_SAVED).toContain('has not been saved anywhere yet');
    expect(REDACTED_COPY_NOT_SAVED).toContain('original document was not saved either');
  });

  it('never softens a redaction that failed on the way to a save', () => {
    expect(REDACTION_NOT_APPLIED_AT_SAVE).toContain('nothing was saved');
    expect(REDACTION_NOT_APPLIED_AT_SAVE).toContain('document was not changed');
  });
});

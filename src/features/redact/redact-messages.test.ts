import { describe, expect, it } from 'vitest';
import type { RedactVerifyResult, TextMatch } from '@shared/types';
import {
  applyButtonLabel,
  DESTRUCTION_WARNING,
  failureText,
  markAllLabel,
  markLabel,
  markSummary,
  percentComplete,
  plainError,
  progressLabel,
  proofText,
  receiptText,
  SEARCHABLE_HINT,
  SEARCHABLE_LABEL,
  searchSummary,
} from './redact-messages';

const VERIFIED: RedactVerifyResult = {
  verified: true,
  pagesRebuilt: [2, 5],
  instancesDestroyed: 3,
  survivingStrings: [],
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

  it('says which proof was run', () => {
    expect(proofText(VERIFIED)).toContain('re-opened the saved document');
  });
});

describe('failureText', () => {
  it('names the survivors and says nothing was changed', () => {
    const text = failureText(['SSN 545-45-6789']);
    expect(text).toContain('NOT applied');
    expect(text).toContain('SSN 545-45-6789');
    expect(text).toContain('was not changed');
  });

  it('names a page that was not really rebuilt, as its own failure', () => {
    const text = failureText([], [3]);
    expect(text).toContain('NOT applied');
    expect(text).toContain('page 3 still carries text');
  });

  it('reads correctly for several pages', () => {
    expect(failureText([], [2, 5])).toContain('pages 2, 5 still carry text');
  });

  it('reports both failure kinds together when both happened', () => {
    const text = failureText(['SSN 1'], [4]);
    expect(text).toContain('1 marked item is still readable');
    expect(text).toContain('and page 4 still carries text');
  });

  it('still refuses loudly when it cannot name what survived', () => {
    expect(failureText([])).toContain('could not be verified');
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

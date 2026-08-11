import { beforeEach, describe, expect, it } from 'vitest';
import type { TextMatch } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
import { useRedactionStore } from '@renderer/features/redact/redaction-store';
import { describeOutcome, markSuggestedTerms } from './redaction-handshake';

const DOC = 'doc-1';

function match(page: number, text: string, index: number): TextMatch {
  return {
    page,
    text,
    index,
    quads: [{ x: 100, y: 700 - index * 20, width: 80, height: 10 }],
  };
}

/** Only the two members the handshake uses; the rest of the viewer is not its business. */
function fakeViewer(hits: Record<string, TextMatch[]>, docId = DOC): ViewerApi {
  return {
    docId,
    findText: (query: string) => Promise.resolve(hits[query] ?? []),
  } as unknown as ViewerApi;
}

beforeEach(() => {
  useRedactionStore.setState({ docId: null, marks: [], selectedId: null, drawing: false });
});

describe('marking what Centurion suggested', () => {
  it('marks every instance and reports the count it really created', async () => {
    const api = fakeViewer({
      '123-45-6789': [match(2, '123-45-6789', 0), match(4, '123-45-6789', 1)],
      'Jane Roe': [match(2, 'Jane Roe', 2)],
    });

    const outcome = await markSuggestedTerms(api, [
      { text: '123-45-6789', reason: 'Social security number' },
      { text: 'Jane Roe', reason: 'Minor child' },
    ]);

    expect(outcome.marksCreated).toBe(3);
    expect(outcome.termsFound).toBe(2);
    expect(outcome.missing).toEqual([]);
    expect(useRedactionStore.getState().marks).toHaveLength(3);
    expect(useRedactionStore.getState().marks.map((mark) => mark.page)).toEqual([2, 4, 2]);
    // Marks only. Nothing about this path can destroy anything.
    expect(outcome.detail).toContain('Marked 3 instances of 2 terms');
    expect(outcome.detail).toContain('applies the redaction himself');
  });

  // Marks are keyed to a document; claiming it first stops the panel wiping them.
  it('claims the document before marking, so the panel does not clear them', async () => {
    useRedactionStore.getState().forDocument('another-doc');
    const api = fakeViewer({ Secret: [match(1, 'Secret', 0)] });

    await markSuggestedTerms(api, [{ text: 'Secret', reason: 'Privileged' }]);

    expect(useRedactionStore.getState().docId).toBe(DOC);
    expect(useRedactionStore.getState().marks).toHaveLength(1);
    // Re-opening the panel on the same document leaves them alone.
    useRedactionStore.getState().forDocument(DOC);
    expect(useRedactionStore.getState().marks).toHaveLength(1);
  });

  it('reports the terms the viewer could not find rather than pretending', async () => {
    const api = fakeViewer({ Found: [match(1, 'Found', 0)] });

    const outcome = await markSuggestedTerms(api, [
      { text: 'Found', reason: 'PII' },
      { text: 'Never written this way', reason: 'PII' },
    ]);

    expect(outcome.marksCreated).toBe(1);
    expect(outcome.termsFound).toBe(1);
    expect(outcome.missing).toEqual(['Never written this way']);
    expect(outcome.detail).toContain('Not found in this document: "Never written this way".');
  });

  it('says plainly when nothing was found, so the answer cannot claim otherwise', async () => {
    const outcome = await markSuggestedTerms(fakeViewer({}), [
      { text: 'Nowhere', reason: 'PII' },
      { text: 'Also nowhere', reason: 'PII' },
    ]);

    expect(outcome.marksCreated).toBe(0);
    expect(useRedactionStore.getState().marks).toEqual([]);
    expect(outcome.detail).toContain('None of the 2 terms were found, so nothing was marked.');
  });

  it('does not double-count a term already marked', async () => {
    const api = fakeViewer({ Repeat: [match(3, 'Repeat', 0)] });
    await markSuggestedTerms(api, [{ text: 'Repeat', reason: 'PII' }]);

    const second = await markSuggestedTerms(api, [{ text: 'Repeat', reason: 'PII' }]);

    expect(second.marksCreated).toBe(0);
    expect(useRedactionStore.getState().marks).toHaveLength(1);
  });
});

describe('the sentence Centurion is told', () => {
  it('counts in plain English, singular and plural', () => {
    expect(
      describeOutcome({ marksCreated: 1, termsFound: 1, termsSearched: 1, missing: [] })
    ).toContain('Marked 1 instance of 1 term.');
    expect(
      describeOutcome({ marksCreated: 12, termsFound: 3, termsSearched: 4, missing: ['x'] })
    ).toContain('Marked 12 instances of 3 terms.');
  });
});

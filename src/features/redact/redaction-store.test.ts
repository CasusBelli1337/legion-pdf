import { beforeEach, describe, expect, it } from 'vitest';
import type { RedactionBox, TextMatch } from '@shared/types';
import {
  SEARCHABLE_BY_DEFAULT,
  pagesOf,
  useRedactionStore,
  verifyStringsOf,
} from './redaction-store';

const RECT = { x: 10, y: 10, width: 40, height: 12 };

function state() {
  return useRedactionStore.getState();
}

beforeEach(() => {
  useRedactionStore.setState({
    docId: 'doc-1',
    marks: [],
    selectedId: null,
    drawing: false,
    reOcr: SEARCHABLE_BY_DEFAULT,
    run: {
      phase: 'idle',
      sourceDocId: null,
      resultDocId: null,
      progress: null,
      receipt: null,
      error: null,
    },
  });
});

describe('marking', () => {
  it('adds a mark and selects it', () => {
    state().addMark(2, RECT);
    expect(state().marks).toHaveLength(1);
    expect(state().selectedId).toBe(state().marks[0]?.id);
  });

  it('moves a mark without disturbing the others', () => {
    state().addMark(1, RECT);
    state().addMark(2, RECT);
    const id = state().marks[0]?.id ?? '';
    state().updateMark(id, { ...RECT, x: 99 });
    expect(state().marks[0]?.rect.x).toBe(99);
    expect(state().marks[1]?.rect.x).toBe(10);
  });

  it('removes a mark and clears the selection when it was the selected one', () => {
    state().addMark(1, RECT);
    const id = state().marks[0]?.id ?? '';
    state().removeMark(id);
    expect(state().marks).toEqual([]);
    expect(state().selectedId).toBeNull();
  });

  it('clears every mark at once', () => {
    state().addMark(1, RECT);
    state().addMark(2, RECT);
    state().clearMarks();
    expect(state().marks).toEqual([]);
  });
});

describe('marking every search hit', () => {
  const matches: TextMatch[] = [
    { page: 1, text: 'SSN 545-45-6789', index: 0, quads: [RECT] },
    { page: 4, text: 'SSN 545-45-6789', index: 1, quads: [RECT, { ...RECT, y: 40 }] },
  ];

  it('adds one mark per quad', () => {
    state().markMatches(matches);
    expect(state().marks).toHaveLength(3);
  });

  it('does not double-mark the same region when the search is run twice', () => {
    state().markMatches(matches);
    state().markMatches(matches);
    expect(state().marks).toHaveLength(3);
  });

  it('keeps hand-drawn marks alongside the search hits', () => {
    state().addMark(9, RECT);
    state().markMatches(matches);
    expect(state().marks).toHaveLength(4);
  });
});

describe('switching documents', () => {
  it('drops marks that belong to the document being left', () => {
    state().addMark(1, RECT);
    state().forDocument('doc-2');
    expect(state().marks).toEqual([]);
    expect(state().docId).toBe('doc-2');
  });

  it('keeps the marks when the same document is re-announced', () => {
    state().addMark(1, RECT);
    state().forDocument('doc-1');
    expect(state().marks).toHaveLength(1);
  });

  it('remembers the searchable-output preference across documents', () => {
    state().setReOcr(false);
    state().forDocument('doc-2');
    expect(state().reOcr).toBe(false);
  });
});

describe('the run and its receipt', () => {
  const RECEIPT = {
    verified: true,
    pagesRebuilt: [1, 4],
    instancesDestroyed: 2,
    survivingStrings: [],
  };

  it('keeps the receipt when the redacted document takes the foreground', () => {
    // Regression: applying opens the redacted document in a NEW tab and makes
    // it active. A receipt held per-active-document vanished at that moment,
    // so the attorney never saw the proof they had just been given.
    state().startRun('doc-1');
    state().noteResultDocument('doc-2');
    state().finishRun(RECEIPT);
    state().forDocument('doc-2');
    expect(state().run.phase).toBe('done');
    expect(state().run.receipt).toEqual(RECEIPT);
  });

  it('keeps it when the attorney switches back to the original', () => {
    state().startRun('doc-1');
    state().noteResultDocument('doc-2');
    state().finishRun(RECEIPT);
    state().forDocument('doc-2');
    state().forDocument('doc-1');
    expect(state().run.receipt).toEqual(RECEIPT);
  });

  it('drops it on a document that had nothing to do with the run', () => {
    state().startRun('doc-1');
    state().noteResultDocument('doc-2');
    state().finishRun(RECEIPT);
    state().forDocument('doc-9');
    expect(state().run.phase).toBe('idle');
    expect(state().run.receipt).toBeNull();
  });

  it('clears the marks once they have been destroyed', () => {
    state().addMark(1, RECT);
    state().startRun('doc-1');
    state().finishRun(RECEIPT);
    expect(state().marks).toEqual([]);
  });

  it('keeps the marks after a failure, so the attorney can try again', () => {
    state().addMark(1, RECT);
    state().startRun('doc-1');
    state().failRun('The redaction was NOT applied.');
    expect(state().marks).toHaveLength(1);
    expect(state().run.phase).toBe('failed');
    expect(state().run.error).toContain('NOT applied');
  });

  it('only records progress for the document being redacted', () => {
    state().startRun('doc-1');
    state().noteProgress({ docId: 'doc-1', phase: 'Rasterizing page', current: 1, total: 2 });
    expect(state().run.progress?.current).toBe(1);
    state().resetRun();
    state().noteProgress({ docId: 'doc-1', phase: 'Rasterizing page', current: 2, total: 2 });
    expect(state().run.progress).toBeNull();
  });
});

describe('what the run is told', () => {
  const marks: RedactionBox[] = [
    { id: 'a', page: 4, rect: RECT },
    { id: 'b', page: 1, rect: RECT, sourceMatch: { page: 1, text: 'SSN 1', index: 0, quads: [] } },
    { id: 'c', page: 4, rect: RECT, sourceMatch: { page: 4, text: 'ssn 1', index: 1, quads: [] } },
  ];

  it('lists the affected pages once each, in order', () => {
    expect(pagesOf(marks)).toEqual([1, 4]);
  });

  it('collects the text of every search hit, de-duplicated', () => {
    expect(verifyStringsOf(marks)).toEqual(['SSN 1']);
  });

  it('contributes nothing from hand-drawn boxes — those are proved page by page', () => {
    expect(verifyStringsOf([{ id: 'a', page: 1, rect: RECT }])).toEqual([]);
  });
});

/**
 * F-7. With the box unticked a redacted production comes back as a pure raster:
 * every page extracts to an empty string and the attorney only finds out when
 * someone downstream cannot search the set. The destruction is identical on
 * both paths, so searchable is the default and the panel says so both ways.
 */
describe('the searchable-output default', () => {
  it('starts ticked, so a redacted production is searchable unless it is turned off', () => {
    expect(SEARCHABLE_BY_DEFAULT).toBe(true);
    expect(useRedactionStore.getInitialState().reOcr).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_THREAD,
  blankThread,
  isCard,
  isTurn,
  threadOf,
  useCenturionStore,
} from './centurion-store';
import type { AiChunk, CenturionToolProposal, CenturionToolResult } from '@shared/types';
import type { CenturionCard, CenturionEntry } from './centurion-store';
import { readFailure } from './error-text';

const DOC = 'doc-1';

beforeEach(() => {
  useCenturionStore.setState({
    threads: {},
    hasKey: null,
    askingDocId: null,
    failureCode: null,
  });
});

function actions(): ReturnType<typeof useCenturionStore.getState> {
  return useCenturionStore.getState();
}

/** Entries are turns or cards; the text tests only care about the turns. */
function textOf(entry: CenturionEntry | undefined): string {
  return entry !== undefined && isTurn(entry) ? entry.content : '';
}

function cards(docId: string): CenturionCard[] {
  return threadOf(docId).entries.filter(isCard);
}

describe('snapshot stability', () => {
  // Regression: the panel's selector originally called blankThread(), handing
  // React a new object on every read. zustand's getSnapshot became unstable and
  // the panel re-rendered until React threw "Maximum update depth exceeded".
  it('returns one shared object for a document with no thread yet', () => {
    expect(threadOf('never-opened')).toBe(threadOf('never-opened'));
    expect(threadOf('never-opened')).toBe(EMPTY_THREAD);
    expect(threadOf(null)).toBe(EMPTY_THREAD);
    expect(EMPTY_THREAD).toEqual(blankThread());
  });

  it('keeps the shared empty thread immutable', () => {
    expect(Object.isFrozen(EMPTY_THREAD)).toBe(true);
    actions().startAsk('some-doc', 'Question');
    expect(EMPTY_THREAD.entries).toEqual([]);
  });
});

describe('conversation threads', () => {
  it('keeps one thread per document tab', () => {
    actions().startAsk(DOC, 'What is this?');
    actions().finishAsk('A settlement agreement (p. 1).');
    actions().startAsk('doc-2', 'And this one?');
    actions().finishAsk('An exhibit list (p. 4).');

    expect(threadOf(DOC).entries.map((entry) => textOf(entry))).toEqual([
      'What is this?',
      'A settlement agreement (p. 1).',
    ]);
    expect(threadOf('doc-2').entries).toHaveLength(2);
    expect(threadOf('doc-3')).toEqual(blankThread());
  });

  it('clears a conversation but keeps the context choice', () => {
    actions().setContextMode(DOC, 'range');
    actions().setRange(DOC, 4, 12);
    actions().startAsk(DOC, 'Question');
    actions().finishAsk('Answer');

    actions().clearThread(DOC);

    expect(threadOf(DOC).entries).toEqual([]);
    expect(threadOf(DOC).contextMode).toBe('range');
    expect(threadOf(DOC).rangeFrom).toBe(4);
    expect(threadOf(DOC).rangeTo).toBe(12);
  });
});

describe('streaming', () => {
  it('accumulates deltas that share a request id', () => {
    actions().startAsk(DOC, 'Question');
    expect(threadOf(DOC).status).toBe('working');

    actions().applyChunk({ requestId: 'req-1', text: '', done: false });
    actions().applyChunk({ requestId: 'req-1', text: 'The ', done: false });
    actions().applyChunk({ requestId: 'req-1', text: 'answer.', done: false });

    expect(threadOf(DOC).streamingText).toBe('The answer.');
    expect(threadOf(DOC).status).toBe('streaming');
    expect(threadOf(DOC).attempt).toBe(1);
  });

  it('discards a clipped attempt when the retry arrives under a new request id', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk({ requestId: 'req-1', text: 'A clipped half-', done: false });

    actions().applyChunk({ requestId: 'req-2', text: '', done: false });
    actions().applyChunk({ requestId: 'req-2', text: 'A whole answer.', done: false });

    expect(threadOf(DOC).streamingText).toBe('A whole answer.');
    expect(threadOf(DOC).attempt).toBe(2);
  });

  it('ignores terminal chunks so the answer never blinks out before it lands', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk({ requestId: 'req-1', text: 'Streaming', done: false });
    actions().applyChunk({ requestId: 'req-1', text: '', done: true });

    expect(threadOf(DOC).streamingText).toBe('Streaming');

    actions().finishAsk('Streaming answer (p. 2).');

    expect(threadOf(DOC).streamingText).toBe('');
    expect(threadOf(DOC).status).toBe('idle');
    expect(textOf(threadOf(DOC).entries.at(-1))).toBe('Streaming answer (p. 2).');
  });

  it('drops chunks that arrive with nothing in flight', () => {
    actions().applyChunk({ requestId: 'stray', text: 'orphan', done: false });
    expect(threadOf(DOC)).toEqual(blankThread());
  });

  it('leaves a failed ask with a plain-English error and no half answer', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk({ requestId: 'req-1', text: 'half an ans', done: false });
    actions().applyChunk({ requestId: 'req-1', text: '', done: true, code: 'CLIPPED' });

    const failure = readFailure(new Error('The answer was cut off twice.'), actions().failureCode);
    actions().failAsk(failure.message);

    expect(failure.code).toBe('CLIPPED');
    expect(threadOf(DOC).streamingText).toBe('');
    expect(threadOf(DOC).status).toBe('idle');
    expect(threadOf(DOC).error).toBe('The answer was cut off twice.');
    expect(
      threadOf(DOC)
        .entries.filter(isTurn)
        .map((entry) => entry.role)
    ).toEqual(['user']);
    expect(actions().askingDocId).toBeNull();
  });

  // The code is the only part of a failure that survives IPC as data; the panel
  // reads it off the terminal chunk rather than parsing it out of English.
  it('keeps the failure code from the terminal chunk and clears it on the next ask', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk({ requestId: 'req-1', text: '', done: true, code: 'NO_KEY' });
    expect(actions().failureCode).toBe('NO_KEY');

    actions().startAsk(DOC, 'Another question');
    expect(actions().failureCode).toBeNull();
  });
});

const PROPOSAL: CenturionToolProposal = {
  toolUseId: 'toolu_1',
  name: 'applyBates',
  input: { prefix: 'PLAINTIFF', startNumber: 1, padWidth: 6, position: 'bottom-right' },
  summary: 'Stamp PLAINTIFF000001 to PLAINTIFF000450 on all 450 pages, bottom right.',
};

function proposalChunk(): AiChunk {
  return { requestId: 'req-1', text: '', done: false, proposal: PROPOSAL };
}

/** The follow-up chunk main sends once the card has settled. */
function settledChunk(result: CenturionToolResult): AiChunk {
  return { requestId: 'req-1', text: '', done: false, proposal: { ...PROPOSAL, result } };
}

describe('confirm cards', () => {
  it('lands a pending card in the thread, after the question that caused it', () => {
    actions().startAsk(DOC, 'Bates-stamp this production');
    actions().applyChunk({ requestId: 'req-1', text: 'I will stamp them.', done: false });
    actions().applyChunk(proposalChunk());

    const entries = threadOf(DOC).entries;
    expect(entries).toHaveLength(2);
    expect(textOf(entries[0])).toBe('Bates-stamp this production');
    expect(cards(DOC)[0]).toMatchObject({
      id: 'toolu_1',
      requestId: 'req-1',
      name: 'applyBates',
      status: 'pending',
      result: null,
    });
    expect(cards(DOC)[0]?.summary).toContain('PLAINTIFF000001');
  });

  it('never shows the same tool call twice', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk(proposalChunk());
    actions().applyChunk(proposalChunk());
    expect(cards(DOC)).toHaveLength(1);
  });

  it('drops a proposal that arrives with nothing in flight', () => {
    actions().applyChunk(proposalChunk());
    expect(threadOf(DOC)).toEqual(blankThread());
  });

  it('settles the card off the follow-up chunk main sends', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk(proposalChunk());
    actions().markCardRunning('toolu_1');
    expect(cards(DOC)[0]?.status).toBe('running');

    actions().applyChunk(settledChunk({ outcome: 'done', message: 'Done - 450 pages stamped.' }));

    expect(cards(DOC)[0]).toMatchObject({
      status: 'done',
      result: 'Done - 450 pages stamped.',
    });
  });

  it('keeps a skip a skip, and a failure a failure', () => {
    for (const [outcome, status] of [
      ['skipped', 'skipped'],
      ['failed', 'failed'],
    ] as const) {
      actions().clearThread(DOC);
      actions().startAsk(DOC, 'Question');
      actions().applyChunk(proposalChunk());
      actions().applyChunk(settledChunk({ outcome, message: `it was ${outcome}` }));
      expect(cards(DOC)[0]?.status).toBe(status);
      expect(cards(DOC)[0]?.result).toBe(`it was ${outcome}`);
    }
  });

  // The document really was changed, so the record of it stays on screen.
  it('keeps settled cards in the thread once the answer lands', () => {
    actions().startAsk(DOC, 'Bates-stamp this');
    actions().applyChunk(proposalChunk());
    actions().settleCard('toolu_1', 'done', 'Done - 450 pages stamped.');
    actions().finishAsk('Stamped PLAINTIFF000001 to PLAINTIFF000450 (p. 1-450).');

    const entries = threadOf(DOC).entries;
    expect(entries.map((entry) => entry.kind)).toEqual(['turn', 'card', 'turn']);
    expect(threadOf(DOC).status).toBe('idle');
  });

  // A settle can land after the ask ended, so it must not depend on askingDocId.
  it('settles a card whose ask has already finished', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk(proposalChunk());
    actions().finishAsk('Answer');
    actions().settleCard('toolu_1', 'skipped', 'Skipped.');
    expect(cards(DOC)[0]?.status).toBe('skipped');
  });
});

describe('the tools switch', () => {
  it('is on by default and survives clearing the conversation', () => {
    expect(blankThread().toolsEnabled).toBe(true);
    actions().startAsk(DOC, 'Question');
    actions().setToolsEnabled(DOC, false);
    actions().clearThread(DOC);
    expect(threadOf(DOC).toolsEnabled).toBe(false);
    expect(threadOf(DOC).entries).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_THREAD, blankThread, threadOf, useCenturionStore } from './centurion-store';
import { readFailure } from './error-text';

const DOC = 'doc-1';

beforeEach(() => {
  useCenturionStore.setState({ threads: {}, hasKey: null, askingDocId: null });
});

function actions(): ReturnType<typeof useCenturionStore.getState> {
  return useCenturionStore.getState();
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
    expect(EMPTY_THREAD.turns).toEqual([]);
  });
});

describe('conversation threads', () => {
  it('keeps one thread per document tab', () => {
    actions().startAsk(DOC, 'What is this?');
    actions().finishAsk('A settlement agreement (p. 1).');
    actions().startAsk('doc-2', 'And this one?');
    actions().finishAsk('An exhibit list (p. 4).');

    expect(threadOf(DOC).turns.map((turn) => turn.content)).toEqual([
      'What is this?',
      'A settlement agreement (p. 1).',
    ]);
    expect(threadOf('doc-2').turns).toHaveLength(2);
    expect(threadOf('doc-3')).toEqual(blankThread());
  });

  it('clears a conversation but keeps the context choice', () => {
    actions().setContextMode(DOC, 'range');
    actions().setRange(DOC, 4, 12);
    actions().startAsk(DOC, 'Question');
    actions().finishAsk('Answer');

    actions().clearThread(DOC);

    expect(threadOf(DOC).turns).toEqual([]);
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
    expect(threadOf(DOC).turns.at(-1)?.content).toBe('Streaming answer (p. 2).');
  });

  it('drops chunks that arrive with nothing in flight', () => {
    actions().applyChunk({ requestId: 'stray', text: 'orphan', done: false });
    expect(threadOf(DOC)).toEqual(blankThread());
  });

  it('leaves a failed ask with a plain-English error and no half answer', () => {
    actions().startAsk(DOC, 'Question');
    actions().applyChunk({ requestId: 'req-1', text: 'half an ans', done: false });

    actions().failAsk(readFailure(new Error('[CLIPPED] The answer was cut off twice.')).message);

    expect(threadOf(DOC).streamingText).toBe('');
    expect(threadOf(DOC).status).toBe('idle');
    expect(threadOf(DOC).error).toBe('The answer was cut off twice.');
    expect(threadOf(DOC).turns.map((turn) => turn.role)).toEqual(['user']);
    expect(actions().askingDocId).toBeNull();
  });
});

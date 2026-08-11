import { describe, expect, it } from 'vitest';
import { DocumentHistory, EmptySnapshotError, UNDO_DEPTH } from './doc-history';

/** Stand-ins for PDF byte arrays; identity is what the history moves around. */
function version(marker: number): Uint8Array {
  return new Uint8Array([marker]);
}

describe('DocumentHistory.record', () => {
  it('starts with nothing to step to in either direction', () => {
    expect(new DocumentHistory().state).toEqual({ canUndo: false, canRedo: false });
  });

  it('makes an undo available once a version has been recorded', () => {
    const history = new DocumentHistory();
    history.record(version(1));
    expect(history.state).toEqual({ canUndo: true, canRedo: false });
  });

  it('keeps the ten most recent versions and drops the oldest', () => {
    const history = new DocumentHistory();
    for (let index = 0; index <= UNDO_DEPTH; index += 1) history.record(version(index));

    // Version 0 fell off the back; stepping all the way lands on version 1.
    const restored: number[] = [];
    let current = version(99);
    for (let step = 0; step < UNDO_DEPTH; step += 1) {
      const previous = history.stepBack(current);
      expect(previous).not.toBeNull();
      if (previous === null) return;
      restored.push(previous[0] ?? -1);
      current = previous;
    }
    expect(restored).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(history.stepBack(current)).toBeNull();
  });

  it('refuses to record an empty version rather than storing a hole', () => {
    expect(() => new DocumentHistory().record(new Uint8Array(0))).toThrow(EmptySnapshotError);
  });
});

describe('DocumentHistory stepping', () => {
  it('returns null when there is nothing to undo or redo', () => {
    const history = new DocumentHistory();
    expect(history.stepBack(version(1))).toBeNull();
    expect(history.stepForward(version(1))).toBeNull();
  });

  it('hands back the recorded version and offers a redo of what was current', () => {
    const history = new DocumentHistory();
    const before = version(1);
    const after = version(2);
    history.record(before);

    expect(history.stepBack(after)).toBe(before);
    expect(history.state).toEqual({ canUndo: false, canRedo: true });
    expect(history.stepForward(before)).toBe(after);
    expect(history.state).toEqual({ canUndo: true, canRedo: false });
  });

  it('walks back through several edits in order', () => {
    const history = new DocumentHistory();
    const [first, second, third] = [version(1), version(2), version(3)];
    history.record(first);
    history.record(second);

    expect(history.stepBack(third)).toBe(second);
    expect(history.stepBack(second)).toBe(first);
    expect(history.stepBack(first)).toBeNull();
  });

  // The classic redo trap: undo, then make a new edit — the branch that was
  // undone can no longer be reached, and offering it would restore the wrong PDF.
  it('drops the redo stack as soon as a new edit is recorded', () => {
    const history = new DocumentHistory();
    history.record(version(1));
    history.stepBack(version(2));
    expect(history.state.canRedo).toBe(true);

    history.record(version(3));

    expect(history.state).toEqual({ canUndo: true, canRedo: false });
    expect(history.stepForward(version(4))).toBeNull();
  });

  it('clear drops both directions', () => {
    const history = new DocumentHistory();
    history.record(version(1));
    history.stepBack(version(2));
    history.clear();
    expect(history.state).toEqual({ canUndo: false, canRedo: false });
  });

  it('refuses to step away from empty current bytes', () => {
    const history = new DocumentHistory();
    history.record(version(1));
    expect(() => history.stepBack(new Uint8Array(0))).toThrow(EmptySnapshotError);
  });
});

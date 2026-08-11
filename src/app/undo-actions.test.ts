import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSession, UndoResult, UndoState } from '@shared/types';

const APPLIED: UndoResult = { applied: true, canUndo: false, canRedo: true };
const NOTHING_TO_DO: UndoResult = { applied: false, canUndo: false, canRedo: false };

function session(overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
    id: 'doc-1',
    filePath: 'C:\\Matters\\Deposition.pdf',
    fileName: 'Deposition.pdf',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 12,
    dirty: true,
    ...overrides,
  };
}

const file = {
  undo: vi.fn(async (): Promise<UndoResult> => APPLIED),
  redo: vi.fn(async (): Promise<UndoResult> => APPLIED),
  undoState: vi.fn(async (): Promise<UndoState> => ({ canUndo: true, canRedo: false })),
  read: vi.fn(async (): Promise<DocumentSession> => session({ pageCount: 8 })),
};

vi.stubGlobal('window', { librarius: { file } });

const { NO_HISTORY, readUndoState, redoActive, undoActive } = await import('./undo-actions');
const { useAppStore } = await import('./store');

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    sessions: [session()],
    activeId: 'doc-1',
    currentPage: 1,
    error: null,
    busy: null,
    notice: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('window', { librarius: { file } });
});

function state() {
  return useAppStore.getState();
}

/**
 * The three ways an undo can land, which is what the attorney sees: it worked,
 * there was nothing to step back to, or it failed and the document is untouched.
 */
describe('undoing the last change', () => {
  it('steps the document back and swaps the new bytes into the viewer', async () => {
    await undoActive();

    expect(file.undo).toHaveBeenCalledWith('doc-1');
    expect(file.read).toHaveBeenCalledWith('doc-1');
    expect(state().sessions[0]?.pageCount).toBe(8);
    expect(state().notice).toBe('Change undone.');
    expect(state().error).toBeNull();
    expect(state().busy).toBeNull();
  });

  // Undo can take pages away; parking the viewer past the end would show nothing.
  it('pulls the current page back into the document when pages disappear', async () => {
    useAppStore.setState({ currentPage: 11 });
    await undoActive();
    expect(state().currentPage).toBe(8);
  });

  it('leaves the current page alone when it still exists', async () => {
    useAppStore.setState({ currentPage: 3 });
    await undoActive();
    expect(state().currentPage).toBe(3);
  });

  it('says so plainly when there is nothing left to undo, and re-reads nothing', async () => {
    file.undo.mockResolvedValueOnce(NOTHING_TO_DO);

    await undoActive();

    expect(file.read).not.toHaveBeenCalled();
    expect(state().notice).toBe('There is nothing left to undo.');
    expect(state().error).toBeNull();
    expect(state().sessions[0]?.pageCount).toBe(12);
  });

  it('explains a failure in plain English and leaves the document as it was', async () => {
    file.undo.mockRejectedValueOnce(
      new Error("Error invoking remote method 'file:undo': Error: The file is damaged.")
    );

    await undoActive();

    expect(state().error).toBe('Could not undo that change: The file is damaged.');
    expect(state().sessions[0]?.pageCount).toBe(12);
    expect(state().busy).toBeNull();
  });

  it('does nothing at all when no document is open', async () => {
    useAppStore.setState({ sessions: [], activeId: null });
    await undoActive();
    expect(file.undo).not.toHaveBeenCalled();
  });
});

describe('redoing a change', () => {
  it('steps forward and refreshes the viewer the same way', async () => {
    await redoActive();

    expect(file.redo).toHaveBeenCalledWith('doc-1');
    expect(state().sessions[0]?.pageCount).toBe(8);
    expect(state().notice).toBe('Change redone.');
  });

  it('says so plainly when there is nothing to redo', async () => {
    file.redo.mockResolvedValueOnce(NOTHING_TO_DO);
    await redoActive();
    expect(state().notice).toBe('There is nothing to redo.');
    expect(file.read).not.toHaveBeenCalled();
  });
});

/**
 * Ctrl+Z fires from the app menu whatever has focus. Inside a text box it has
 * to mean "undo my typing" — reverting the whole PDF because the attorney was
 * mid-sentence in the Centurion box would be a nasty surprise.
 */
describe('Ctrl+Z while typing in a text box', () => {
  it('hands the keystroke back to the focused field and leaves the document alone', async () => {
    const execCommand = vi.fn();
    vi.stubGlobal('document', {
      activeElement: { tagName: 'TEXTAREA', getAttribute: () => null },
      execCommand,
    });

    await undoActive();

    expect(execCommand).toHaveBeenCalledWith('undo');
    expect(file.undo).not.toHaveBeenCalled();
  });

  it('steps the document when focus is on a toolbar button instead', async () => {
    vi.stubGlobal('document', {
      activeElement: { tagName: 'BUTTON', getAttribute: () => null },
      execCommand: vi.fn(),
    });

    await undoActive();

    expect(file.undo).toHaveBeenCalledWith('doc-1');
  });
});

describe('reading the state of the Undo/Redo controls', () => {
  it('asks the main process about the open document', async () => {
    expect(await readUndoState('doc-1')).toEqual({ canUndo: true, canRedo: false });
    expect(file.undoState).toHaveBeenCalledWith('doc-1');
  });

  it('reports nothing available when no document is open, without an IPC call', async () => {
    expect(await readUndoState(null)).toEqual(NO_HISTORY);
    expect(file.undoState).not.toHaveBeenCalled();
  });

  // A tab that closed under the question is the realistic failure; disabled
  // buttons are the honest answer, and there is nothing for the attorney to do.
  it('reports nothing available when the document has gone', async () => {
    file.undoState.mockRejectedValueOnce(new Error('No open document with id doc-1.'));
    expect(await readUndoState('doc-1')).toEqual(NO_HISTORY);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSession } from '@shared/types';

/**
 * The op-completion path, tested without React: what `runDocumentOp` leaves
 * behind IS the difference between an edit an attorney can see and F-2's silent
 * write. Four things have to land together — the new bytes in the session, the
 * dirty flag that guards the tab on close, a fresh session object (which is the
 * seam `useUndoState` watches to re-enable Undo), and the footer receipt.
 */

const SAVED: DocumentSession = {
  id: 'doc-1',
  filePath: 'C:\\Matters\\Deposition.pdf',
  fileName: 'Deposition.pdf',
  bytes: new Uint8Array([1, 2, 3]),
  pageCount: 4,
  dirty: false,
};

const EDITED: DocumentSession = { ...SAVED, bytes: new Uint8Array([9, 9, 9]), dirty: true };

const file = { read: vi.fn(async (): Promise<DocumentSession> => EDITED) };
vi.stubGlobal('window', { librarius: { file } });

const { runDocumentOp } = await import('./use-stamp-runner');
const { useAppStore } = await import('@renderer/app/store');

function activeSession(): DocumentSession | undefined {
  return useAppStore.getState().sessions[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  file.read.mockResolvedValue(EDITED);
  useAppStore.setState({
    sessions: [SAVED],
    activeId: 'doc-1',
    error: null,
    errorDocId: null,
    notice: null,
    noticeDocId: null,
    busy: null,
  });
});

describe('a document op that lands', () => {
  it('re-reads the document so the page repaints with the change', async () => {
    await runDocumentOp('doc-1', 'Highlighting the selection', () => Promise.resolve('Done.'));

    expect(file.read).toHaveBeenCalledWith('doc-1');
    expect(activeSession()?.bytes).toEqual(EDITED.bytes);
  });

  // Without this the tab still says SAVED and closing it discards the work.
  it('carries the dirty flag over, so the close guard can see the work', async () => {
    await runDocumentOp('doc-1', 'Highlighting the selection', () => Promise.resolve('Done.'));

    expect(activeSession()?.dirty).toBe(true);
  });

  // A NEW session object is what re-runs the undo-state read; the same object
  // back would leave the Undo button dim on a change that is undoable.
  it('swaps in a new session object, which is what refreshes Undo', async () => {
    await runDocumentOp('doc-1', 'Highlighting the selection', () => Promise.resolve('Done.'));

    expect(activeSession()).not.toBe(SAVED);
  });

  it('puts the receipt in the footer, scoped to the document that earned it', async () => {
    await runDocumentOp('doc-1', 'Highlighting the selection', () =>
      Promise.resolve('Highlighted 3 areas on page 3. Save the document to keep it.')
    );
    const { notice, noticeDocId } = useAppStore.getState();

    expect(notice).toBe('Highlighted 3 areas on page 3. Save the document to keep it.');
    expect(noticeDocId).toBe('doc-1');
  });

  it('reports what it is doing while it works, and stops when it is done', async () => {
    const seen: Array<string | null> = [];
    await runDocumentOp('doc-1', 'Highlighting the selection', () => {
      seen.push(useAppStore.getState().busy);
      return Promise.resolve('Done.');
    });

    expect(seen).toEqual(['Highlighting the selection']);
    expect(useAppStore.getState().busy).toBeNull();
  });

  it('answers with the receipt', async () => {
    const outcome = await runDocumentOp('doc-1', 'Stamping', () => Promise.resolve('Stamped.'));

    expect(outcome).toEqual({ ok: true, receipt: 'Stamped.' });
  });
});

describe('a document op that fails', () => {
  it('explains it in plain English without the IPC wrapper', async () => {
    const outcome = await runDocumentOp('doc-1', 'Stamping', () =>
      Promise.reject(new Error("Error invoking remote method 'stamp:highlight': No page 9."))
    );

    expect(outcome).toEqual({ ok: false, message: 'No page 9.' });
    expect(useAppStore.getState().error).toBe('No page 9.');
    expect(useAppStore.getState().errorDocId).toBe('doc-1');
  });

  it('leaves the session alone and stops the pulse', async () => {
    await runDocumentOp('doc-1', 'Stamping', () => Promise.reject(new Error('nope')));

    expect(activeSession()).toBe(SAVED);
    expect(useAppStore.getState().busy).toBeNull();
  });
});

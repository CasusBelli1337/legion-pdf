import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloseChoice, DocumentSession, SaveResult } from '@shared/types';

// The viewer barrel pulls in pdfjs and its worker asset; only its two
// bookkeeping exports matter here.
vi.mock('../components/viewer', () => ({
  finishPrint: vi.fn(),
  preparePrint: vi.fn(),
  forgetTabView: vi.fn(),
}));

const { closeDocument, printActive } = await import('./document-actions');
const { useAppStore } = await import('./store');

const SAVE_RESULT: SaveResult = {
  filePath: 'C:\\Matters\\Deposition.pdf',
  byteLength: 2048,
  savedAt: '2026-08-10T18:00:00.000Z',
};

const file = {
  close: vi.fn(async (): Promise<void> => undefined),
  save: vi.fn(async (): Promise<SaveResult> => SAVE_RESULT),
  saveAs: vi.fn(async (): Promise<SaveResult | null> => SAVE_RESULT),
};
const appBridge = {
  confirmClose: vi.fn(async (): Promise<CloseChoice> => 'cancel'),
  print: vi.fn(async (): Promise<void> => undefined),
};

vi.stubGlobal('window', { librarius: { file, app: appBridge } });

function session(overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
    id: 'doc-1',
    filePath: 'C:\\Matters\\Deposition.pdf',
    fileName: 'Deposition.pdf',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 4,
    dirty: true,
    ...overrides,
  };
}

function openIds(): string[] {
  return useAppStore.getState().sessions.map((item) => item.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ sessions: [session()], activeId: 'doc-1', error: null, busy: null });
});

/**
 * F-4. Live QA closed a dirty tab and the watermark it had just applied was
 * gone — no dialog, no toast, no undo. All three answers are pinned here.
 */
describe('closing a tab with unsaved changes', () => {
  it('asks before dropping the work, naming the file', async () => {
    appBridge.confirmClose.mockResolvedValueOnce('discard');
    await closeDocument('doc-1');
    expect(appBridge.confirmClose).toHaveBeenCalledWith('Deposition.pdf');
  });

  it('keeps the tab and saves nothing when the attorney cancels', async () => {
    appBridge.confirmClose.mockResolvedValueOnce('cancel');
    await closeDocument('doc-1');
    expect(openIds()).toEqual(['doc-1']);
    expect(file.close).not.toHaveBeenCalled();
    expect(file.save).not.toHaveBeenCalled();
  });

  it('closes without saving when that is what the attorney chose', async () => {
    appBridge.confirmClose.mockResolvedValueOnce('discard');
    await closeDocument('doc-1');
    expect(openIds()).toEqual([]);
    expect(file.close).toHaveBeenCalledWith('doc-1');
    expect(file.save).not.toHaveBeenCalled();
  });

  it('saves over the document before closing it', async () => {
    appBridge.confirmClose.mockResolvedValueOnce('save');
    await closeDocument('doc-1');
    expect(file.save).toHaveBeenCalledWith('doc-1');
    expect(file.saveAs).not.toHaveBeenCalled();
    expect(openIds()).toEqual([]);
  });

  it('asks where to put a document that has never been saved', async () => {
    useAppStore.setState({ sessions: [session({ filePath: null, fileName: 'Combined.pdf' })] });
    appBridge.confirmClose.mockResolvedValueOnce('save');
    await closeDocument('doc-1');
    expect(file.saveAs).toHaveBeenCalledWith('doc-1');
    expect(openIds()).toEqual([]);
  });

  // Backing out of the location dialog must back out of the close too.
  it('keeps the tab open when the Save As dialog is cancelled', async () => {
    useAppStore.setState({ sessions: [session({ filePath: null, fileName: 'Combined.pdf' })] });
    appBridge.confirmClose.mockResolvedValueOnce('save');
    file.saveAs.mockResolvedValueOnce(null);
    await closeDocument('doc-1');
    expect(openIds()).toEqual(['doc-1']);
    expect(file.close).not.toHaveBeenCalled();
  });

  it('keeps the tab open and explains when the save itself fails', async () => {
    appBridge.confirmClose.mockResolvedValueOnce('save');
    file.save.mockRejectedValueOnce(new Error('The file is read-only.'));
    await closeDocument('doc-1');
    expect(openIds()).toEqual(['doc-1']);
    expect(useAppStore.getState().error).toBe('Could not save: The file is read-only.');
  });

  // A broken prompt is not permission to throw the work away.
  it('keeps the tab open when the prompt cannot be raised at all', async () => {
    appBridge.confirmClose.mockRejectedValueOnce(new Error('no window'));
    await closeDocument('doc-1');
    expect(openIds()).toEqual(['doc-1']);
    expect(file.close).not.toHaveBeenCalled();
  });
});

/**
 * F-5, the renderer half. The main process resolves a cancelled print, so the
 * footer must be left exactly as it was — a cancel is a non-event, and the red
 * line is reserved for a printer that really did not work.
 */
describe('printing', () => {
  it('says nothing at all when the print dialog is cancelled', async () => {
    await printActive();

    expect(appBridge.print).toHaveBeenCalledWith('doc-1');
    expect(useAppStore.getState().error).toBeNull();
    expect(useAppStore.getState().notice).toBeNull();
  });

  it('still explains a print that genuinely failed', async () => {
    appBridge.print.mockRejectedValueOnce(new Error('Invalid printer settings'));
    await printActive();

    expect(useAppStore.getState().error).toBe('Could not print: Invalid printer settings');
  });
});

describe('closing a saved tab', () => {
  it('closes straight away without a prompt', async () => {
    useAppStore.setState({ sessions: [session({ dirty: false })] });
    await closeDocument('doc-1');
    expect(appBridge.confirmClose).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledWith('doc-1');
    expect(openIds()).toEqual([]);
  });

  it('does nothing for a tab that is not open', async () => {
    await closeDocument('doc-missing');
    expect(file.close).not.toHaveBeenCalled();
    expect(openIds()).toEqual(['doc-1']);
  });
});

/**
 * The gates every save runs, in order, through the real document actions.
 *
 * Two lanes now hold work that is not in the file yet — placed signatures and
 * redaction marks — and both ask before anything permanent happens. This file
 * pins the seam: the order they run in, that a "no" to either one saves nothing,
 * and that applying redactions at save time saves the REDACTED COPY rather than
 * the document the attorney pressed Save on.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CloseChoice,
  DocumentSession,
  OpResult,
  ProgressEvent,
  RedactVerifyResult,
  RedactionBox,
  SaveResult,
  SignatureAsset,
} from '@shared/types';
import type { RedactionGateChoice } from '../features/redact/redact-consent';

// The viewer barrel pulls in pdfjs and its worker asset; only its bookkeeping
// exports matter here.
vi.mock('../components/viewer', () => ({
  finishPrint: vi.fn(),
  preparePrint: vi.fn(),
  forgetTabView: vi.fn(),
}));

// The renderer's last redaction proof. Proved on its own in pdfjs-proof.test.ts.
vi.mock('@renderer/lib/extract-text', () => ({
  extractDocumentText: vi.fn(async () => ({ text: '', charsPerPage: [0] })),
  NoTextLayerError: class NoTextLayerError extends Error {},
}));

const asked: string[] = [];

const askToFlatten = vi.fn(async (_count: number): Promise<boolean> => true);
vi.mock('../features/signature/flatten-confirm-host', () => ({
  askToFlatten: (count: number) => {
    asked.push('signatures');
    return askToFlatten(count);
  },
  reportFlattenProgress: vi.fn(),
  closeFlattenModal: vi.fn(),
}));

const askAtSave = vi.fn(
  async (_count: number, _pages: number): Promise<RedactionGateChoice> => 'cancel'
);
vi.mock('../features/redact/redact-confirm-host', () => ({
  askToDestroy: vi.fn(),
  askAtSave: (count: number, pages: number) => {
    asked.push('redactions');
    return askAtSave(count, pages);
  },
  reportRedactProgress: vi.fn(),
  closeRedactConfirm: vi.fn(),
}));

const { closeDocument, saveActive, saveActiveAs } = await import('./document-actions');
const { useAppStore } = await import('./store');
const { useRedactionStore } = await import('../features/redact/redaction-store');
const { usePlacementStore } = await import('../features/signature/placement-store');

const SOURCE_ID = 'doc-1';
const REDACTED_ID = 'doc-redacted';

const SIGNATURE: SignatureAsset = {
  id: 'sig-1',
  label: 'Full signature',
  filePath: 'C:\\Users\\a\\signatures\\sig-1.png',
  widthPx: 300,
  heightPx: 100,
  createdAt: '2026-08-19T18:00:00.000Z',
};

const RECEIPT: RedactVerifyResult = {
  verified: true,
  pagesRebuilt: [3],
  instancesDestroyed: 1,
  survivingStrings: [],
  docId: REDACTED_ID,
};

const SAVE_RESULT: SaveResult = {
  filePath: 'C:\\Matters\\Deposition (redacted).pdf',
  byteLength: 4096,
  savedAt: '2026-08-19T18:00:00.000Z',
};

function session(overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
    id: SOURCE_ID,
    filePath: 'C:\\Matters\\Deposition.pdf',
    fileName: 'Deposition.pdf',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 4,
    dirty: false,
    ...overrides,
  };
}

const file = {
  read: vi.fn(async (docId: string): Promise<DocumentSession> =>
    docId === REDACTED_ID
      ? session({ id: REDACTED_ID, filePath: null, fileName: 'Deposition (redacted).pdf' })
      : session()
  ),
  save: vi.fn(async (): Promise<SaveResult> => SAVE_RESULT),
  saveAs: vi.fn(async (): Promise<SaveResult | null> => SAVE_RESULT),
  close: vi.fn(async (): Promise<void> => undefined),
};

const redact = {
  apply: vi.fn(async (): Promise<OpResult<RedactVerifyResult>> => ({
    bytes: new Uint8Array([9, 9, 9]),
    pagesIn: 4,
    pagesOut: 4,
    detail: RECEIPT,
  })),
};

const stamp = { signaturePlace: vi.fn(async () => undefined) };
const appBridge = { confirmClose: vi.fn(async (): Promise<CloseChoice> => 'cancel') };
const onProgress = vi.fn(
  (_channel: string, _callback: (event: ProgressEvent) => void) => () => undefined
);

vi.stubGlobal('window', { librarius: { file, redact, stamp, app: appBridge, onProgress } });

function mark(id: string, page: number): RedactionBox {
  return { id, page, rect: { x: 10, y: 20, width: 90, height: 12 } };
}

function markThis(marks: RedactionBox[]): void {
  useRedactionStore.setState({
    docId: SOURCE_ID,
    marks,
    selectedId: null,
    drawing: false,
    reOcr: true,
    run: {
      phase: 'idle',
      sourceDocId: null,
      resultDocId: null,
      progress: null,
      receipt: null,
      error: null,
    },
  });
}

function openIds(): string[] {
  return useAppStore.getState().sessions.map((item) => item.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  asked.length = 0;
  askToFlatten.mockResolvedValue(true);
  askAtSave.mockResolvedValue('cancel');
  markThis([]);
  usePlacementStore.setState({ placements: [], selectedId: null });
  useAppStore.setState({
    sessions: [session()],
    activeId: SOURCE_ID,
    error: null,
    busy: null,
    notice: null,
  });
});

describe('the order the gates run in', () => {
  it('asks about signatures before redactions', async () => {
    usePlacementStore.getState().place(SOURCE_ID, SIGNATURE, 2, { x: 10, y: 10 });
    markThis([mark('a', 3)]);
    askAtSave.mockResolvedValueOnce('save-anyway');

    await saveActive();

    expect(asked).toEqual(['signatures', 'redactions']);
  });

  // Flattening changes the bytes a redaction would then destroy from, so the
  // second question is never even reached when the first one is refused.
  it('never reaches the redaction gate when the signature question is refused', async () => {
    usePlacementStore.getState().place(SOURCE_ID, SIGNATURE, 2, { x: 10, y: 10 });
    markThis([mark('a', 3)]);
    askToFlatten.mockResolvedValueOnce(false);

    await saveActive();

    expect(asked).toEqual(['signatures']);
    expect(file.save).not.toHaveBeenCalled();
  });

  it('raises neither dialog on an ordinary save', async () => {
    await saveActive();
    expect(asked).toEqual([]);
    expect(file.save).toHaveBeenCalledWith(SOURCE_ID);
  });
});

describe('saving a document that still carries marks', () => {
  it('names how many marks are pending, and on how many pages', async () => {
    markThis([mark('a', 3), mark('b', 3), mark('c', 7)]);
    askAtSave.mockResolvedValueOnce('cancel');
    await saveActive();
    expect(askAtSave).toHaveBeenCalledWith(3, 2);
  });

  it('saves the file as it stands when the attorney keeps the marks', async () => {
    markThis([mark('a', 3)]);
    askAtSave.mockResolvedValueOnce('save-anyway');

    await saveActive();

    expect(file.save).toHaveBeenCalledWith(SOURCE_ID);
    expect(redact.apply).not.toHaveBeenCalled();
    expect(useRedactionStore.getState().marks).toHaveLength(1);
  });

  it('saves nothing when the attorney cancels', async () => {
    markThis([mark('a', 3)]);
    askAtSave.mockResolvedValueOnce('cancel');

    await saveActive();

    expect(file.save).not.toHaveBeenCalled();
    expect(file.saveAs).not.toHaveBeenCalled();
  });

  /** The audit-critical branch, through the real Save handler. */
  it('sends the redacted copy — never the source — to Save As when redactions are applied', async () => {
    markThis([mark('a', 3)]);
    askAtSave.mockResolvedValueOnce('apply');

    await saveActive();

    expect(file.saveAs).toHaveBeenCalledTimes(1);
    expect(file.saveAs).toHaveBeenCalledWith(REDACTED_ID, 'Deposition (redacted).pdf');
    expect(file.save).not.toHaveBeenCalled();
    expect(openIds()).toEqual([SOURCE_ID, REDACTED_ID]);
  });

  it('does the same from Save As, and asks for one location only', async () => {
    markThis([mark('a', 3)]);
    askAtSave.mockResolvedValueOnce('apply');

    await saveActiveAs();

    expect(file.saveAs).toHaveBeenCalledTimes(1);
    expect(file.saveAs).toHaveBeenCalledWith(REDACTED_ID, 'Deposition (redacted).pdf');
  });
});

describe('closing a tab that still carries marks', () => {
  it('asks first, even though the file itself is untouched', async () => {
    markThis([mark('a', 3)]);
    appBridge.confirmClose.mockResolvedValueOnce('discard');

    await closeDocument(SOURCE_ID);

    expect(appBridge.confirmClose).toHaveBeenCalledWith('Deposition.pdf');
    expect(redact.apply).not.toHaveBeenCalled();
    expect(openIds()).toEqual([]);
  });

  it('closes a clean tab with nothing marked without a prompt', async () => {
    await closeDocument(SOURCE_ID);
    expect(appBridge.confirmClose).not.toHaveBeenCalled();
    expect(openIds()).toEqual([]);
  });

  // The redacted copy is saved, but the SOURCE was not — so the tab it was
  // closing stays open rather than disappearing with unsaved work in it.
  it('keeps the source tab open when the marks are applied on the way out', async () => {
    markThis([mark('a', 3)]);
    appBridge.confirmClose.mockResolvedValueOnce('save');
    askAtSave.mockResolvedValueOnce('apply');

    await closeDocument(SOURCE_ID);

    expect(file.saveAs).toHaveBeenCalledWith(REDACTED_ID, 'Deposition (redacted).pdf');
    expect(file.close).not.toHaveBeenCalled();
    expect(openIds()).toContain(SOURCE_ID);
  });
});

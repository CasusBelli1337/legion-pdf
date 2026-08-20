/**
 * The save-time gate against the real app wiring — the audit-critical file.
 *
 * Redaction produces a NEW document and never touches the source. So the one
 * thing these tests exist to prove is that "Apply redactions now" at save time
 * sends the REDACTED document to the location dialog, and that the unredacted
 * source is never written anywhere in its place.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentSession,
  OpResult,
  ProgressEvent,
  RedactVerifyResult,
  RedactionBox,
  SaveResult,
} from '@shared/types';
import type { RedactionGateChoice } from './redact-consent';

// pdfjs is the renderer's last proof; the proof itself is tested in
// pdfjs-proof.test.ts. Here it only has to answer "nothing survived" — an
// image-only rebuilt page, which is what a redaction produces.
const readPageTextBoxes = vi.fn(async (_bytes: Uint8Array, pages: readonly number[]) =>
  pages.map((page) => ({ page, boxes: [] }))
);
vi.mock('./page-text-boxes', () => ({
  readPageTextBoxes: (bytes: Uint8Array, pages: readonly number[]) =>
    readPageTextBoxes(bytes, pages),
}));

// The dialog is React DOM on a real document; the ANSWER is what matters here.
const askAtSave = vi.fn(
  async (_count: number, _pages: number): Promise<RedactionGateChoice> => 'cancel'
);
const closeRedactConfirm = vi.fn();
const reportRedactProgress = vi.fn();
vi.mock('./redact-confirm-host', () => ({
  askToDestroy: vi.fn(),
  askAtSave: (count: number, pages: number) => askAtSave(count, pages),
  reportRedactProgress: (event: ProgressEvent | null) => reportRedactProgress(event),
  closeRedactConfirm: () => closeRedactConfirm(),
}));

const { redactedCopyName, redactionGateFor } = await import('./save-redaction-gate');
const { useRedactionStore } = await import('./redaction-store');
const { useAppStore } = await import('@renderer/app/store');
const { REDACTED_COPY_NOT_SAVED } = await import('./redact-messages');

const SOURCE_ID = 'doc-1';
const REDACTED_ID = 'doc-redacted';

const RECEIPT: RedactVerifyResult = {
  verified: true,
  pagesRebuilt: [3],
  instancesDestroyed: 2,
  survivingStrings: [],
  terms: [{ text: 'Social Security', before: 2, remaining: 0, marked: 2 }],
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
    dirty: true,
    ...overrides,
  };
}

function mark(id: string, page: number): RedactionBox {
  return {
    id,
    page,
    rect: { x: 10, y: 20, width: 90, height: 12 },
    sourceMatch: { page, text: 'Social Security', index: 0, quads: [] },
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

let progressCallback: ((event: ProgressEvent) => void) | null = null;
const stopProgress = vi.fn();
const onProgress = vi.fn((channel: string, callback: (event: ProgressEvent) => void) => {
  if (channel === 'redact:progress') progressCallback = callback;
  return stopProgress;
});

vi.stubGlobal('window', { librarius: { file, redact, onProgress } });

function markThis(docId: string, marks: RedactionBox[]): void {
  useRedactionStore.setState({
    docId,
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
  progressCallback = null;
  askAtSave.mockResolvedValue('cancel');
  markThis(SOURCE_ID, []);
  useAppStore.setState({
    sessions: [session()],
    activeId: SOURCE_ID,
    error: null,
    busy: null,
    notice: null,
  });
});

describe('a save with nothing marked', () => {
  it('never raises the gate', async () => {
    expect(await redactionGateFor(SOURCE_ID)).toBe(true);
    expect(askAtSave).not.toHaveBeenCalled();
  });

  // Marks belong to ONE document; another file's marks must never stop this save.
  it('ignores marks that belong to a different document', async () => {
    markThis('doc-other', [mark('a', 3)]);
    expect(await redactionGateFor(SOURCE_ID)).toBe(true);
    expect(askAtSave).not.toHaveBeenCalled();
  });
});

describe('saving without redacting', () => {
  it('lets the save through and destroys nothing', async () => {
    markThis(SOURCE_ID, [mark('a', 3), mark('b', 7)]);
    askAtSave.mockResolvedValueOnce('save-anyway');

    expect(await redactionGateFor(SOURCE_ID)).toBe(true);
    expect(redact.apply).not.toHaveBeenCalled();
    expect(file.saveAs).not.toHaveBeenCalled();
  });

  it('leaves every mark where it was, ready to apply later', async () => {
    markThis(SOURCE_ID, [mark('a', 3), mark('b', 7)]);
    askAtSave.mockResolvedValueOnce('save-anyway');
    await redactionGateFor(SOURCE_ID);

    expect(useRedactionStore.getState().marks).toHaveLength(2);
  });
});

describe('cancelling the gate', () => {
  it('saves nothing at all', async () => {
    markThis(SOURCE_ID, [mark('a', 3)]);
    askAtSave.mockResolvedValueOnce('cancel');

    expect(await redactionGateFor(SOURCE_ID)).toBe(false);
    expect(redact.apply).not.toHaveBeenCalled();
    expect(file.save).not.toHaveBeenCalled();
    expect(file.saveAs).not.toHaveBeenCalled();
    expect(useRedactionStore.getState().marks).toHaveLength(1);
  });
});

describe('applying the redactions during a save', () => {
  beforeEach(() => {
    markThis(SOURCE_ID, [mark('a', 3), mark('b', 3)]);
    askAtSave.mockResolvedValue('apply');
  });

  it('destroys the marked content on the document being saved', async () => {
    await redactionGateFor(SOURCE_ID);
    expect(redact.apply).toHaveBeenCalledWith(
      SOURCE_ID,
      expect.objectContaining({ dpi: 300, reOcr: true, verifyStrings: ['Social Security'] })
    );
  });

  /** The whole point: the file that leaves the building is the redacted one. */
  it('sends the REDACTED document to the location dialog, under a name nobody can mix up', async () => {
    await redactionGateFor(SOURCE_ID);
    expect(file.saveAs).toHaveBeenCalledTimes(1);
    expect(file.saveAs).toHaveBeenCalledWith(REDACTED_ID, 'Deposition (redacted).pdf');
  });

  /** The failure this whole lane exists to prevent. */
  it('never writes the unredacted source anywhere', async () => {
    await redactionGateFor(SOURCE_ID);
    expect(file.save).not.toHaveBeenCalled();
    expect(file.saveAs).not.toHaveBeenCalledWith(SOURCE_ID, expect.anything());
  });

  it('stops the save that raised it, so nothing overwrites the redacted copy', async () => {
    expect(await redactionGateFor(SOURCE_ID)).toBe(false);
  });

  it('leaves the source open, unredacted, and still unsaved', async () => {
    await redactionGateFor(SOURCE_ID);
    const source = useAppStore.getState().sessions.find((item) => item.id === SOURCE_ID);
    expect(openIds()).toContain(SOURCE_ID);
    expect(source?.dirty).toBe(true);
    expect(source?.filePath).toBe('C:\\Matters\\Deposition.pdf');
  });

  it('opens the redacted document in its own tab', async () => {
    await redactionGateFor(SOURCE_ID);
    expect(openIds()).toContain(REDACTED_ID);
  });

  it('says which file was saved and which one was not', async () => {
    await redactionGateFor(SOURCE_ID);
    const notice = useAppStore.getState().notice ?? '';
    expect(notice).toContain('Deposition (redacted).pdf');
    expect(notice).toContain('still open, unredacted, and was not saved');
  });

  // Backing out of the location dialog is never a silent save.
  it('says so plainly when the location dialog is cancelled', async () => {
    file.saveAs.mockResolvedValueOnce(null);
    await redactionGateFor(SOURCE_ID);

    expect(useAppStore.getState().notice).toBe(REDACTED_COPY_NOT_SAVED);
    expect(file.save).not.toHaveBeenCalled();
  });

  it('saves nothing when the redaction cannot be verified', async () => {
    redact.apply.mockRejectedValueOnce(new Error('Page 3 could not be rebuilt.'));
    expect(await redactionGateFor(SOURCE_ID)).toBe(false);

    expect(file.saveAs).not.toHaveBeenCalled();
    expect(file.save).not.toHaveBeenCalled();
    expect(useAppStore.getState().error).toContain('Page 3 could not be rebuilt.');
  });

  it('keeps the dialog moving while the pages are rebuilt, then unsubscribes', async () => {
    await redactionGateFor(SOURCE_ID);
    expect(onProgress).toHaveBeenCalledWith('redact:progress', expect.any(Function));
    expect(stopProgress).toHaveBeenCalledTimes(1);

    const event: ProgressEvent = {
      docId: SOURCE_ID,
      phase: 'Rebuilding page',
      current: 2,
      total: 3,
    };
    progressCallback?.(event);
    expect(reportRedactProgress).toHaveBeenCalledWith(event);

    reportRedactProgress.mockClear();
    progressCallback?.({ ...event, docId: 'doc-other' });
    expect(reportRedactProgress).not.toHaveBeenCalled();
  });

  it('takes the dialog down before the location dialog opens', async () => {
    const order: string[] = [];
    closeRedactConfirm.mockImplementation(() => order.push('dialog-closed'));
    file.saveAs.mockImplementationOnce(async () => {
      order.push('save-as');
      return SAVE_RESULT;
    });

    await redactionGateFor(SOURCE_ID);
    expect(order[0]).toBe('dialog-closed');
    expect(order).toContain('save-as');
    expect(order.indexOf('dialog-closed')).toBeLessThan(order.indexOf('save-as'));
  });
});

describe('naming the redacted copy', () => {
  it('never hands back the source document’s own name', () => {
    expect(redactedCopyName('Deposition.pdf')).toBe('Deposition (redacted).pdf');
    expect(redactedCopyName('Smith v. Jones - Ex 4.PDF')).toBe(
      'Smith v. Jones - Ex 4 (redacted).PDF'
    );
    expect(redactedCopyName('Untitled')).toBe('Untitled (redacted)');
  });
});

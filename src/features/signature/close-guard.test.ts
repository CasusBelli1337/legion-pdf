/**
 * How live signatures meet the save and close machinery.
 *
 * A signature dropped on a page lives in the RENDERER. The main-process byte
 * store has not changed, so `session.dirty` is still false — which means the
 * F-4 close guard, left alone, would let a signed-but-unsaved tab close without
 * a word. This file pins the seam between the two: the guard fires on live
 * placements, saving asks first, cancelling the question cancels the save, and
 * discarding a tab leaves the file unsigned.
 *
 * It lives beside the feature rather than beside document-actions because it is
 * this lane's contribution to that flow that is being proved.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloseChoice, DocumentSession, SaveResult, SignatureAsset } from '@shared/types';

// The viewer barrel pulls in pdfjs; only its bookkeeping exports matter here.
vi.mock('../../components/viewer', () => ({
  finishPrint: vi.fn(),
  preparePrint: vi.fn(),
  forgetTabView: vi.fn(),
}));

// The dialog itself is React DOM on a real document; the ANSWER is what matters.
const askToFlatten = vi.fn(async (_count: number): Promise<boolean> => true);
vi.mock('./flatten-confirm-host', () => ({
  askToFlatten: (count: number) => askToFlatten(count),
  reportFlattenProgress: vi.fn(),
  closeFlattenModal: vi.fn(),
}));

const { closeDocument, saveActive } = await import('@renderer/app/document-actions');
const { useAppStore } = await import('@renderer/app/store');
const { usePlacementStore } = await import('./placement-store');
const { DEFAULT_SIGNATURE_HEIGHT } = await import('./placement-geometry');

const SIGNATURE: SignatureAsset = {
  id: 'sig-1',
  label: 'Full signature',
  filePath: 'C:\\Users\\a\\signatures\\sig-1.png',
  widthPx: 300,
  heightPx: 100,
  createdAt: '2026-08-10T18:00:00.000Z',
};

const SAVE_RESULT: SaveResult = {
  filePath: 'C:\\Matters\\Deposition.pdf',
  byteLength: 2048,
  savedAt: '2026-08-10T18:00:00.000Z',
};

function session(overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
    id: 'doc-1',
    filePath: 'C:\\Matters\\Deposition.pdf',
    fileName: 'Deposition.pdf',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 4,
    dirty: false,
    ...overrides,
  };
}

const file = {
  close: vi.fn(async (): Promise<void> => undefined),
  read: vi.fn(async (): Promise<DocumentSession> => session({ dirty: true })),
  save: vi.fn(async (): Promise<SaveResult> => SAVE_RESULT),
  saveAs: vi.fn(async (): Promise<SaveResult | null> => SAVE_RESULT),
};
const stamp = { signaturePlace: vi.fn(async () => undefined) };
const appBridge = { confirmClose: vi.fn(async (): Promise<CloseChoice> => 'cancel') };

vi.stubGlobal('window', { librarius: { file, app: appBridge, stamp } });

function placeOne(page = 2): string {
  return usePlacementStore.getState().place('doc-1', SIGNATURE, page, { x: 100, y: 100 });
}

function openIds(): string[] {
  return useAppStore.getState().sessions.map((item) => item.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  askToFlatten.mockResolvedValue(true);
  usePlacementStore.setState({ placements: [], selectedId: null });
  useAppStore.setState({ sessions: [session()], activeId: 'doc-1', error: null, busy: null });
});

describe('saving a document that carries live signatures', () => {
  it('asks before writing them in, naming how many', async () => {
    placeOne();
    placeOne(3);
    await saveActive();
    expect(askToFlatten).toHaveBeenCalledWith(2);
  });

  it('places every one, then saves', async () => {
    placeOne();
    await saveActive();
    expect(stamp.signaturePlace).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({
        signatureId: 'sig-1',
        page: 2,
        // Whatever the placement height is, the aspect ratio comes with it.
        widthPt: DEFAULT_SIGNATURE_HEIGHT * 3,
        heightPt: DEFAULT_SIGNATURE_HEIGHT,
      })
    );
    expect(file.save).toHaveBeenCalledWith('doc-1');
  });

  it('leaves nothing live once they are part of the file', async () => {
    placeOne();
    await saveActive();
    expect(usePlacementStore.getState().placements).toEqual([]);
  });

  // Backing out of "permanently" is not an instruction to save an unsigned file.
  it('saves nothing at all when the attorney backs out', async () => {
    placeOne();
    askToFlatten.mockResolvedValueOnce(false);
    await saveActive();
    expect(stamp.signaturePlace).not.toHaveBeenCalled();
    expect(file.save).not.toHaveBeenCalled();
    expect(usePlacementStore.getState().placements).toHaveLength(1);
  });

  it('never raises the question on an ordinary save', async () => {
    await saveActive();
    expect(askToFlatten).not.toHaveBeenCalled();
    expect(file.save).toHaveBeenCalledWith('doc-1');
  });

  it('does not save when a placement could not be written', async () => {
    placeOne();
    placeOne(3);
    stamp.signaturePlace.mockRejectedValueOnce(new Error('The file is read-only.'));
    await saveActive();
    expect(file.save).not.toHaveBeenCalled();
    expect(useAppStore.getState().error).toContain('No signatures were placed');
    expect(useAppStore.getState().error).toContain('read-only');
  });

  // The already-written one must not be written a second time on the retry.
  it('keeps only the signatures that did not land', async () => {
    placeOne();
    placeOne(3);
    stamp.signaturePlace
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('The file is read-only.'));
    await saveActive();
    expect(usePlacementStore.getState().placements).toHaveLength(1);
    expect(usePlacementStore.getState().placements[0]?.page).toBe(3);
  });
});

describe('closing a tab that carries live signatures', () => {
  it('asks first, even though the file itself is untouched', async () => {
    placeOne();
    appBridge.confirmClose.mockResolvedValueOnce('discard');
    await closeDocument('doc-1');
    expect(appBridge.confirmClose).toHaveBeenCalledWith('Deposition.pdf');
  });

  it('leaves the document unsigned when the attorney discards', async () => {
    placeOne();
    appBridge.confirmClose.mockResolvedValueOnce('discard');
    await closeDocument('doc-1');
    expect(stamp.signaturePlace).not.toHaveBeenCalled();
    expect(file.save).not.toHaveBeenCalled();
    expect(openIds()).toEqual([]);
  });

  it('drops the placements with the tab, so they cannot follow the next document', async () => {
    placeOne();
    appBridge.confirmClose.mockResolvedValueOnce('discard');
    await closeDocument('doc-1');
    expect(usePlacementStore.getState().placements).toEqual([]);
  });

  it('places them and saves when that is what the attorney chose', async () => {
    placeOne();
    appBridge.confirmClose.mockResolvedValueOnce('save');
    await closeDocument('doc-1');
    expect(askToFlatten).toHaveBeenCalledWith(1);
    expect(stamp.signaturePlace).toHaveBeenCalledTimes(1);
    expect(file.save).toHaveBeenCalledWith('doc-1');
    expect(openIds()).toEqual([]);
  });

  it('keeps the tab open when the flatten question is cancelled on the way out', async () => {
    placeOne();
    appBridge.confirmClose.mockResolvedValueOnce('save');
    askToFlatten.mockResolvedValueOnce(false);
    await closeDocument('doc-1');
    expect(file.save).not.toHaveBeenCalled();
    expect(openIds()).toEqual(['doc-1']);
    expect(usePlacementStore.getState().placements).toHaveLength(1);
  });

  it('still closes a clean tab with nothing placed on it, without a prompt', async () => {
    await closeDocument('doc-1');
    expect(appBridge.confirmClose).not.toHaveBeenCalled();
    expect(openIds()).toEqual([]);
  });
});

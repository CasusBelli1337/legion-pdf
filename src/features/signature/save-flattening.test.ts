import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignatureAsset } from '@shared/types';
import { flattenHeading, flattenQuestion } from './flatten-copy';
import { usePlacementStore, type LivePlacement } from './placement-store';
import {
  hasLiveSignatures,
  partialFailureMessage,
  runFlatten,
  SAVE_MAY_PROCEED,
} from './save-flattening';

const SIGNATURE: SignatureAsset = {
  id: 'sig-1',
  label: 'Full signature',
  filePath: 'C:\\Users\\a\\signatures\\sig-1.png',
  widthPx: 300,
  heightPx: 100,
  createdAt: '2026-08-10T18:00:00.000Z',
};

function placement(id: string, page: number): LivePlacement {
  return {
    id,
    docId: 'doc-1',
    signature: SIGNATURE,
    page,
    at: { x: 100, y: 100 },
    widthPt: 126,
    heightPt: 42,
    withDate: false,
    dateFormat: 'MM/DD/YYYY',
  };
}

beforeEach(() => {
  usePlacementStore.setState({ placements: [], selectedId: null });
});

describe('deciding whether to flatten', () => {
  it('never asks when the document has no live signatures', async () => {
    const confirm = vi.fn(async () => true);
    const place = vi.fn(async () => undefined);

    const result = await runFlatten({ placements: [], confirm, place });

    expect(result.outcome).toBe('nothing-to-do');
    expect(confirm).not.toHaveBeenCalled();
    expect(place).not.toHaveBeenCalled();
  });

  it('writes every placement once the attorney agrees', async () => {
    const place = vi.fn(async () => undefined);
    const result = await runFlatten({
      placements: [placement('a', 1), placement('b', 4)],
      confirm: async () => true,
      place,
    });

    expect(result).toEqual({ outcome: 'flattened', placed: 2, error: null });
    expect(place).toHaveBeenCalledTimes(2);
  });

  // The attorney backing out is the whole reason the dialog exists: an unsigned
  // file written over the original would be worse than no save at all.
  it('writes nothing at all when the attorney cancels', async () => {
    const place = vi.fn(async () => undefined);
    const result = await runFlatten({
      placements: [placement('a', 1)],
      confirm: async () => false,
      place,
    });

    expect(result.outcome).toBe('cancelled');
    expect(place).not.toHaveBeenCalled();
  });

  it('asks once for the whole run, not once per signature', async () => {
    const confirm = vi.fn(async () => true);
    await runFlatten({
      placements: [placement('a', 1), placement('b', 2), placement('c', 3)],
      confirm,
      place: async () => undefined,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(3);
  });

  it('stops at the first failure and reports how many landed', async () => {
    const place = vi
      .fn<(placed: LivePlacement) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('That signature is no longer in your library.'));

    const result = await runFlatten({
      placements: [placement('a', 1), placement('b', 2), placement('c', 3)],
      confirm: async () => true,
      place,
    });

    expect(result.outcome).toBe('failed');
    expect(result.placed).toBe(1);
    expect(result.error).toContain('no longer in your library');
    expect(place).toHaveBeenCalledTimes(2);
  });

  it('counts movement for the attorney, one line per signature', async () => {
    const report = vi.fn();
    await runFlatten({
      placements: [placement('a', 1), placement('b', 2)],
      confirm: async () => true,
      place: async () => undefined,
      report,
    });
    expect(report.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('writes them one at a time, so each write takes the previous one\u2019s bytes', async () => {
    const order: string[] = [];
    const place = async (item: LivePlacement): Promise<void> => {
      order.push(`start-${item.id}`);
      await Promise.resolve();
      order.push(`end-${item.id}`);
    };
    await runFlatten({
      placements: [placement('a', 1), placement('b', 2)],
      confirm: async () => true,
      place,
    });
    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
  });
});

describe('what each outcome means for the save', () => {
  it('lets an ordinary save through and stops one the attorney backed out of', () => {
    expect(SAVE_MAY_PROCEED['nothing-to-do']).toBe(true);
    expect(SAVE_MAY_PROCEED.flattened).toBe(true);
    expect(SAVE_MAY_PROCEED.cancelled).toBe(false);
    expect(SAVE_MAY_PROCEED.failed).toBe(false);
  });

  it('says plainly how far a failed run got', () => {
    const message = partialFailureMessage(
      { outcome: 'failed', placed: 2, error: 'The file is read-only.' },
      5
    );
    expect(message).toContain('2 of 5 signatures were placed');
    expect(message).toContain('was not saved');
    expect(message).toContain('still on the page');
  });
});

describe('what the attorney is asked', () => {
  it('spells out that it is permanent', () => {
    expect(flattenQuestion(3)).toBe(
      "Permanently place 3 signatures into the document? They can't be moved or removed after this."
    );
  });

  it('counts one signature as one', () => {
    expect(flattenQuestion(1)).toContain('1 signature into');
    expect(flattenHeading(1)).toBe('Place this signature into the document?');
  });
});

describe('what the close guard can see', () => {
  it('sees a document carrying unsaved signatures', () => {
    usePlacementStore.getState().place('doc-1', SIGNATURE, 2, { x: 10, y: 10 });
    expect(hasLiveSignatures('doc-1')).toBe(true);
    expect(hasLiveSignatures('doc-2')).toBe(false);
  });

  it('sees nothing once they have been placed or removed', () => {
    const id = usePlacementStore.getState().place('doc-1', SIGNATURE, 2, { x: 10, y: 10 });
    usePlacementStore.getState().remove(id);
    expect(hasLiveSignatures('doc-1')).toBe(false);
  });
});

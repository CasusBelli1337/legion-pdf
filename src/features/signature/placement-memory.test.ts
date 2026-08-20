/**
 * The store's side of the remembered height: a resize IS the setting, and the
 * next placement arrives at it. The stored value itself is covered by
 * ./signature-height.test.ts; here the storage is stubbed so the wiring — which
 * is what broke the owner's habit of resizing every single signature — is the
 * only thing under test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignatureAsset } from '@shared/types';

const memory = vi.hoisted(() => ({ height: 68, writes: [] as number[] }));

vi.mock('./signature-height', () => ({
  placementHeight: () => memory.height,
  rememberPlacementHeight: (heightPt: number) => {
    memory.height = heightPt;
    memory.writes.push(heightPt);
  },
}));

const { placementsFor, usePlacementStore } = await import('./placement-store');

function signature(): SignatureAsset {
  return {
    id: 'sig-1',
    label: 'Full signature',
    filePath: 'C:\\Users\\a\\signatures\\sig-1.png',
    widthPx: 300,
    heightPx: 100,
    createdAt: '2026-08-10T18:00:00.000Z',
  };
}

function live(docId: string) {
  return placementsFor(usePlacementStore.getState().placements, docId);
}

beforeEach(() => {
  usePlacementStore.setState({ placements: [], selectedId: null });
  memory.height = 68;
  memory.writes = [];
});

describe('the remembered signature height', () => {
  it('is what a new placement arrives at', () => {
    memory.height = 110;
    usePlacementStore.getState().place('doc-1', signature(), 1, { x: 0, y: 0 });
    expect(live('doc-1')[0]?.heightPt).toBe(110);
    expect(live('doc-1')[0]?.widthPt).toBe(330);
  });

  it('is updated by every resize, with nothing saved and nothing asked', () => {
    const id = usePlacementStore.getState().place('doc-1', signature(), 1, { x: 0, y: 0 });
    usePlacementStore.getState().resizeTo(id, 132);
    expect(memory.writes).toEqual([132]);
    expect(memory.height).toBe(132);
  });

  it('carries the last size to the next signature dropped', () => {
    const store = usePlacementStore.getState();
    const first = store.place('doc-1', signature(), 1, { x: 0, y: 0 });
    store.resizeTo(first, 132);
    store.place('doc-1', signature(), 4, { x: 10, y: 10 });
    expect(live('doc-1')[1]?.heightPt).toBe(132);
  });

  it('carries it onto the next document too — it belongs to the signature', () => {
    const store = usePlacementStore.getState();
    store.resizeTo(store.place('doc-1', signature(), 1, { x: 0, y: 0 }), 90);
    store.place('doc-2', signature(), 2, { x: 0, y: 0 });
    expect(live('doc-2')[0]?.heightPt).toBe(90);
  });
});

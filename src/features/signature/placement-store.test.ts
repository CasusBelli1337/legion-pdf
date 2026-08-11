import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentSession, SignatureAsset } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { DEFAULT_SIGNATURE_HEIGHT } from './placement-geometry';
import { placementsFor, usePlacementStore } from './placement-store';

function signature(overrides: Partial<SignatureAsset> = {}): SignatureAsset {
  return {
    id: 'sig-1',
    label: 'Full signature',
    filePath: 'C:\\Users\\a\\signatures\\sig-1.png',
    widthPx: 300,
    heightPx: 100,
    createdAt: '2026-08-10T18:00:00.000Z',
    ...overrides,
  };
}

function session(id: string): DocumentSession {
  return {
    id,
    filePath: `C:\\Matters\\${id}.pdf`,
    fileName: `${id}.pdf`,
    bytes: new Uint8Array([1]),
    pageCount: 10,
    dirty: false,
  };
}

function state() {
  return usePlacementStore.getState();
}

function live(docId: string) {
  return placementsFor(state().placements, docId);
}

beforeEach(() => {
  usePlacementStore.setState({ placements: [], selectedId: null });
  useAppStore.setState({ sessions: [session('doc-1'), session('doc-2')], activeId: 'doc-1' });
});

describe('placing a signature', () => {
  it('lands where it was dropped, at the default height, aspect locked', () => {
    state().place('doc-1', signature(), 4, { x: 100, y: 200 });
    const [placed] = live('doc-1');
    expect(placed?.page).toBe(4);
    expect(placed?.at).toEqual({ x: 100, y: 200 });
    expect(placed?.heightPt).toBe(DEFAULT_SIGNATURE_HEIGHT);
    expect(placed?.widthPt).toBe(DEFAULT_SIGNATURE_HEIGHT * 3);
  });

  it('selects what was just placed, so it can be adjusted straight away', () => {
    const id = state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    expect(state().selectedId).toBe(id);
  });

  it('starts with the date stamp off — it is a per-signature choice, not a default', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    expect(live('doc-1')[0]?.withDate).toBe(false);
  });

  it('keeps several on one document, in the order they were dropped', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    state().place('doc-1', signature({ id: 'sig-2', label: 'Initials' }), 7, { x: 5, y: 5 });
    expect(live('doc-1').map((placement) => placement.page)).toEqual([1, 7]);
  });
});

describe('adjusting a placement', () => {
  it('moves one without disturbing the others', () => {
    const first = state().place('doc-1', signature(), 1, { x: 10, y: 10 });
    state().place('doc-1', signature(), 2, { x: 20, y: 20 });
    state().moveTo(first, { x: 99, y: 99 });
    expect(live('doc-1')[0]?.at).toEqual({ x: 99, y: 99 });
    expect(live('doc-1')[1]?.at).toEqual({ x: 20, y: 20 });
  });

  it('resizes by height and recomputes the width from the image, never stretching it', () => {
    const id = state().place('doc-1', signature({ widthPx: 400, heightPx: 100 }), 1, {
      x: 0,
      y: 0,
    });
    state().resizeTo(id, 60);
    expect(live('doc-1')[0]).toMatchObject({ heightPt: 60, widthPt: 240 });
  });

  it('refuses a height outside what a signature can sensibly be', () => {
    const id = state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    state().resizeTo(id, 5000);
    expect(live('doc-1')[0]?.heightPt).toBe(400);
    state().resizeTo(id, 0);
    expect(live('doc-1')[0]?.heightPt).toBe(8);
  });

  it('carries the date choice per signature, not across all of them', () => {
    const first = state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    state().place('doc-1', signature(), 2, { x: 0, y: 0 });
    state().setDate(first, { withDate: true, dateFormat: 'MMMM D, YYYY' });
    expect(live('doc-1')[0]).toMatchObject({ withDate: true, dateFormat: 'MMMM D, YYYY' });
    expect(live('doc-1')[1]?.withDate).toBe(false);
  });
});

describe('removing a placement', () => {
  it('drops it and clears the selection when it was the selected one', () => {
    const id = state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    state().remove(id);
    expect(live('doc-1')).toEqual([]);
    expect(state().selectedId).toBeNull();
  });

  it('leaves the selection alone when a different one is removed', () => {
    const first = state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    const second = state().place('doc-1', signature(), 2, { x: 0, y: 0 });
    state().remove(first);
    expect(state().selectedId).toBe(second);
  });
});

/**
 * The whole point of keying by document: an attorney signs one exhibit, checks
 * another, and comes back to find their signature still where they left it.
 */
describe('more than one document open', () => {
  it('keeps every document to its own placements', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    state().place('doc-2', signature(), 3, { x: 0, y: 0 });
    expect(live('doc-1')).toHaveLength(1);
    expect(live('doc-2')).toHaveLength(1);
    expect(live('doc-1')[0]?.page).toBe(1);
  });

  it('survives a tab switch — placements are not tied to the foreground tab', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    useAppStore.getState().setActive('doc-2');
    useAppStore.getState().setActive('doc-1');
    expect(live('doc-1')).toHaveLength(1);
  });
});

describe('closing a document', () => {
  it('drops its placements — they were never in the file', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    state().clearDocument('doc-1');
    expect(live('doc-1')).toEqual([]);
  });

  it('drops them when the tab actually closes, whatever route it took', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    state().place('doc-2', signature(), 1, { x: 0, y: 0 });
    useAppStore.getState().closeSession('doc-1');
    expect(live('doc-1')).toEqual([]);
    expect(live('doc-2')).toHaveLength(1);
  });

  it('clears a selection that belonged to the document being closed', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    useAppStore.getState().closeSession('doc-1');
    expect(state().selectedId).toBeNull();
  });

  it('leaves the placements alone when the session list changed for another reason', () => {
    state().place('doc-1', signature(), 1, { x: 0, y: 0 });
    const before = state().placements;
    useAppStore.getState().replaceSession({ ...session('doc-1'), dirty: true });
    expect(state().placements).toBe(before);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSession } from '@shared/types';
import { useAppStore } from '../../app/store';
import { openNewDocuments } from './new-documents';

/**
 * Combine, split, and extract hand back store ids in the op's detail; this is
 * the renderer half that turns those ids into tabs. The ids are typed all the
 * way from shared/ipc.ts, so what needs proving here is the behaviour: every id
 * becomes a tab, in order, and a document that cannot be read fails loudly
 * instead of leaving the attorney with a receipt and no tab.
 */
function session(id: string): DocumentSession {
  return {
    id,
    filePath: null,
    fileName: `${id}.pdf`,
    bytes: new Uint8Array([37]),
    pageCount: 2,
    dirty: true,
  };
}

function stubBridge(read: (docId: string) => Promise<DocumentSession>): void {
  vi.stubGlobal('window', { librarius: { file: { read } } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  useAppStore.setState({ sessions: [], activeId: null });
});

describe('openNewDocuments', () => {
  it('opens one tab per adopted id, in the order the main process created them', async () => {
    stubBridge((docId) => Promise.resolve(session(docId)));

    await openNewDocuments(['part-1', 'part-2', 'part-3']);

    expect(useAppStore.getState().sessions.map((item) => item.id)).toEqual([
      'part-1',
      'part-2',
      'part-3',
    ]);
    expect(useAppStore.getState().activeId).toBe('part-3');
  });

  it('opens nothing when an op created nothing', async () => {
    stubBridge(() => Promise.reject(new Error('should not be called')));

    await openNewDocuments([]);

    expect(useAppStore.getState().sessions).toEqual([]);
  });

  it('fails loudly when an adopted document cannot be read back', async () => {
    stubBridge(() => Promise.reject(new Error('No open document with id part-1.')));

    await expect(openNewDocuments(['part-1'])).rejects.toThrow(/could not be opened in a tab/);
    expect(useAppStore.getState().sessions).toEqual([]);
  });
});

/**
 * Writing bookmarks back: one `ops:bookmarksSet` round trip, then the session
 * is re-read so the tab's unsaved dot and the viewer's bytes match what is now
 * in the document (UI golden rule 3), and the rail re-reads the outline from
 * `ops:bookmarksGet` rather than trusting its own copy.
 */

import { useCallback, useState } from 'react';
import type { BookmarkNode } from '@shared/types';
import { useAppStore } from '../../app/store';

export interface BookmarkEditor {
  busy: boolean;
  error: string | null;
  /** Replaces the whole outline, then reports `receipt` in the status footer. */
  save(tree: readonly BookmarkNode[], receipt: string): Promise<void>;
}

/** Plain English for the attorney, never a stack trace. */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}

export function useBookmarkEditor(docId: string | null, onSaved: () => void): BookmarkEditor {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (tree: readonly BookmarkNode[], receipt: string): Promise<void> => {
      if (docId === null) return;
      const store = useAppStore.getState();
      setBusy(true);
      setError(null);
      store.setBusy('Updating bookmarks');
      try {
        await window.librarius.ops.bookmarksSet(docId, [...tree]);
        store.replaceSession(await window.librarius.file.read(docId));
        useAppStore.getState().setNotice(receipt);
        onSaved();
      } catch (caught) {
        setError(describe(caught));
        useAppStore.getState().setError(`Could not change the bookmarks: ${describe(caught)}`);
      } finally {
        setBusy(false);
        useAppStore.getState().setBusy(null);
      }
    },
    [docId, onSaved]
  );

  return { busy, error, save };
}

/**
 * The recently-opened list the main process has been keeping all along (F-2:
 * `file:recent` persisted correctly but nothing ever showed it). Read once when
 * the empty state appears, which is the only time it is on screen.
 */

import { useCallback, useEffect, useState } from 'react';
import type { RecentFile } from '@shared/types';
import { MAX_RECENT_SHOWN } from './recent-copy';

export interface RecentFilesState {
  files: RecentFile[];
  /** Empties the list on disk as well — the "Clear list" button. */
  clear(): void;
  /** Drops one entry that turned out not to be on disk any more. */
  forget(filePath: string): void;
}

export function useRecentFiles(): RecentFilesState {
  const [files, setFiles] = useState<RecentFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.librarius.file
      .recent()
      .then((list) => {
        if (!cancelled) setFiles(list.slice(0, MAX_RECENT_SHOWN));
      })
      .catch(() => {
        // A list that cannot be read is an empty list, never a broken screen.
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    void window.librarius.file.recentClear().catch(() => undefined);
  }, []);

  const forget = useCallback((filePath: string) => {
    setFiles((current) => current.filter((item) => item.filePath !== filePath));
  }, []);

  return { files, clear, forget };
}

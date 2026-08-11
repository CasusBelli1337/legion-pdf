/**
 * The recently-opened documents, on the empty state where an attorney looks for
 * them. Clicking one opens it the same way a drop does; one that is no longer
 * on disk says so and leaves the list rather than sitting there failing.
 */

import type { RecentFile } from '@shared/types';
import { openPaths } from '../document-actions';
import { useAppStore } from '../store';
import { formatOpenedAt, missingFileNotice } from './recent-copy';
import { useRecentFiles } from './use-recent-files';

async function openRecent(file: RecentFile, forget: (filePath: string) => void): Promise<void> {
  if (await openPaths([file.filePath])) return;
  forget(file.filePath);
  useAppStore.getState().setError(missingFileNotice(file.fileName));
}

function RecentRow({ file, onOpen }: { file: RecentFile; onOpen(): void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={file.filePath}
        className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-armory-interactive"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-text-primary">{file.fileName}</span>
          <span className="block truncate text-xs text-text-muted">{file.filePath}</span>
        </span>
        <span className="readout shrink-0 text-text-muted">{formatOpenedAt(file.openedAt)}</span>
      </button>
    </li>
  );
}

export function RecentFiles() {
  const { files, clear, forget } = useRecentFiles();
  if (files.length === 0) return null;

  return (
    <section className="w-full max-w-xl rounded-md border border-armory-border bg-armory-surface p-3 text-left">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="readout text-text-muted">Recent documents</h2>
        <button
          type="button"
          onClick={clear}
          className="rounded-md border border-armory-border-strong px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary"
        >
          Clear list
        </button>
      </div>
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {files.map((file) => (
          <RecentRow key={file.filePath} file={file} onOpen={() => void openRecent(file, forget)} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Status footer: mono 11px readout — filename, page count, zoom.
 */

import { useActiveSession, useAppStore } from '../store';

export function StatusFooter() {
  const session = useActiveSession();
  const currentPage = useAppStore((state) => state.currentPage);
  const zoom = useAppStore((state) => state.zoom);
  const error = useAppStore((state) => state.error);
  const notice = useAppStore((state) => state.notice);

  const fields =
    session === null
      ? ['No document']
      : [
          session.fileName,
          `${currentPage} / ${session.pageCount}`,
          `${Math.round(zoom * 100)}%`,
          session.dirty ? 'Unsaved changes' : 'Saved',
        ];

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-armory-border bg-armory-surface px-3">
      <span className="readout text-text-muted">{fields.join(' - ')}</span>
      {notice !== null && <span className="readout text-text-secondary">{notice}</span>}
      {error !== null && <span className="readout ml-auto text-danger">{error}</span>}
    </footer>
  );
}

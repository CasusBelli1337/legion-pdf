/**
 * Status footer: mono 11px readout — filename, page count, zoom.
 */

import { useActiveSession, useAppStore } from '../store';
import { useLiveSignatureCount } from '../../features/signature/placement-store';

function saveField(dirty: boolean, unplaced: number): string {
  if (unplaced > 0) {
    const label = unplaced === 1 ? '1 unplaced signature' : `${unplaced} unplaced signatures`;
    return `Unsaved changes - ${label}`;
  }
  return dirty ? 'Unsaved changes' : 'Saved';
}

export function StatusFooter() {
  const session = useActiveSession();
  const currentPage = useAppStore((state) => state.currentPage);
  const zoom = useAppStore((state) => state.zoom);
  const error = useAppStore((state) => state.error);
  const notice = useAppStore((state) => state.notice);
  const unplaced = useLiveSignatureCount(session?.id ?? null);

  const fields =
    session === null
      ? ['No document']
      : [
          session.fileName,
          `${currentPage} / ${session.pageCount}`,
          `${Math.round(zoom * 100)}%`,
          saveField(session.dirty, unplaced),
        ];

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-armory-border bg-armory-surface px-3">
      <span className="readout text-text-muted">{fields.join(' - ')}</span>
      {notice !== null && <span className="readout text-text-secondary">{notice}</span>}
      {error !== null && <span className="readout ml-auto text-danger">{error}</span>}
    </footer>
  );
}

/**
 * Left rail. A labelled mounting slot: the viewer lane replaces the body with
 * the virtualized thumbnail list (src/components/thumbnails/**).
 */

import { useActiveSession } from '../store';

export function ThumbnailRail() {
  const session = useActiveSession();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-armory-border bg-armory-surface">
      <div className="flex h-9 shrink-0 items-center border-b border-armory-border px-3">
        <span className="readout text-text-muted">Pages</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {session === null ? (
          <p className="text-xs text-text-muted">No document open.</p>
        ) : (
          <p className="text-xs text-text-muted">
            {session.pageCount} {session.pageCount === 1 ? 'page' : 'pages'}. Thumbnails arrive with
            the viewer.
          </p>
        )}
      </div>
    </aside>
  );
}

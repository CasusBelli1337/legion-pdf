/**
 * The Pages side of the right rail: the thumbnails, what is selected, and the
 * right-click menu over them.
 *
 * Clicking a page still takes the viewer there — that is what the rail is for —
 * while Ctrl and Shift build a selection the menu and a drag can act on. The
 * count strip above the list is the only place the attorney can read back how
 * many pages he has picked out of five hundred.
 */

import { useState } from 'react';
import type { DocumentSession } from '@shared/types';
import type { ContextMenuAnchor } from '../../app/shell/context-menu';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { useViewerApi } from '../viewer';
import { RailPageMenu } from './rail-page-menu';
import { SelectionBar } from './rail-selection-bar';
import { ThumbnailList } from './thumbnail-list';
import { useRailOps } from './use-rail-ops';
import { useRailSelection } from './use-rail-selection';

interface RailPagesTabProps {
  session: DocumentSession;
  document: PDFDocumentProxy | null;
  currentPage: number;
  /** How wide a thumbnail may be drawn, from the rail's current width. */
  width: number;
}

interface MenuState {
  page: number;
  anchor: ContextMenuAnchor;
}

export function RailPagesTab({ session, document, currentPage, width }: RailPagesTabProps) {
  const api = useViewerApi();
  const selection = useRailSelection(session.pageCount);
  const ops = useRailOps(session, selection);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const onSelect = (page: number, event: React.MouseEvent): void => {
    selection.select(page, event);
    // Ctrl and Shift are building a selection; yanking the viewer to page 300
    // in the middle of that would lose the attorney's place.
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) api?.goToPage(page);
  };

  const onContext = (page: number, event: React.MouseEvent): void => {
    event.preventDefault();
    selection.focusForMenu(page);
    setMenu({ page, anchor: { x: event.clientX, y: event.clientY } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={ops.onKeyDown}>
      <SelectionBar
        pageCount={session.pageCount}
        selectedCount={selection.selected.length}
        onClear={selection.clear}
      />
      <ThumbnailList
        document={document}
        pageCount={session.pageCount}
        currentPage={currentPage}
        selection={selection.selection}
        width={width}
        onSelect={onSelect}
        onContext={onContext}
        onDragPage={selection.beginDrag}
        onDropBefore={ops.reorder}
      />
      {menu !== null && (
        <RailPageMenu
          {...menu}
          selected={selection.selected}
          pageCount={session.pageCount}
          busy={ops.busy}
          onRun={(action) => ops.runMenu(action, menu.page)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

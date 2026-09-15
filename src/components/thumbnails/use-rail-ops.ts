/**
 * Everything the rail can DO to a document: the right-click menu's commands,
 * the Delete and Escape keys, and a drag that lands.
 *
 * Each operation goes through the Organize lane's runner, which streams
 * progress, re-reads the document afterwards so the viewer and the page count
 * catch up, and puts the receipt ("Removed 2 pages. 10 left.") in the status
 * footer. Undo covers every one of them on the main side, so nothing here stops
 * to ask "are you sure?".
 */

import type { DocumentSession } from '@shared/types';
import { reorderPages } from '../../features/organize/organize-actions';
import { isSameOrder, moveSelectionBefore } from '../../features/organize/selection';
import { useOpsRunner } from '../../features/organize/use-ops-runner';
import { useViewerApi } from '../viewer';
import { RAIL_OPS, isRailOp } from './rail-actions';
import type { RailMenuAction } from './rail-menu';
import { railKeyAction } from './rail-selection';
import type { RailSelection } from './use-rail-selection';

export interface RailOps {
  /** True while an operation runs: the menu greys out rather than queueing. */
  busy: boolean;
  /** A menu item, including the two that only move the viewer or the selection. */
  runMenu(action: RailMenuAction, page: number): void;
  onKeyDown(event: React.KeyboardEvent): void;
  /** Drop the dragged pages before this page (pageCount + 1 means the end). */
  reorder(beforePage: number): void;
}

export function useRailOps(session: DocumentSession, selection: RailSelection): RailOps {
  const runner = useOpsRunner(session.id);
  const api = useViewerApi();
  const busy = runner.busy !== null;

  const run = (action: RailMenuAction): void => {
    const pages = selection.selected;
    if (!isRailOp(action) || pages.length === 0 || busy) return;
    const op = RAIL_OPS[action](session.id, pages);
    void runner.run(op.label, op.work).then(() => {
      if (op.clearsSelection) selection.clear();
    });
  };

  const runMenu = (action: RailMenuAction, page: number): void => {
    if (action === 'go-to') api?.goToPage(page);
    else if (action === 'select-all') selection.selectAll();
    else run(action);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const key = railKeyAction(event.key);
    if (key === null) return;
    event.preventDefault();
    if (key === 'clear') selection.clear();
    else run('delete');
  };

  // A drag that changed nothing never reaches the main process, and the pages
  // that moved stay selected where they landed.
  const reorder = (beforePage: number): void => {
    const moved = selection.dragging();
    if (moved.size === 0 || busy) return;
    const order = moveSelectionBefore(session.pageCount, moved, beforePage);
    if (isSameOrder(order)) return;
    selection.followOrder(order, moved);
    void runner.run('Rearranging pages', () => reorderPages(session.id, order));
  };

  return { busy, runMenu, onKeyDown, reorder };
}

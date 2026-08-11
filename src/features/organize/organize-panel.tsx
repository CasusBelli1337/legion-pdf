/**
 * Organize Pages — the F-2 dock panel. Thumbnails of the open document, with
 * multi-select, drag to reorder, and the page operations along the top. Split
 * and Combine take over the panel body rather than floating over the document.
 *
 * The body is keyed by document id, so switching tabs remounts it with a clean
 * selection instead of carrying page numbers from another file.
 */

import { useState } from 'react';
import type { DocumentSession, MergeSource } from '@shared/types';
import { useViewerApi } from '../../components/viewer';
import { useActiveSession } from '../../app/store';
import { CombineView } from './combine-view';
import { OrganizeStatus } from './organize-status';
import { OrganizeToolbar } from './organize-toolbar';
import { combineDocuments, reorderPages, splitDocument } from './organize-actions';
import { pageActions, productionActions, type ActionContext } from './panel-actions';
import { PageGrid } from './page-grid';
import { PanelHeader } from './panel-header';
import { isSameOrder, moveSelectionBefore } from './selection';
import { SplitView } from './split-view';
import { useOpsRunner } from './use-ops-runner';
import { useOrganizeSelection } from './use-organize-selection';
import { usePageThumbnails } from './use-page-thumbnails';

type PanelMode = 'pages' | 'split' | 'combine';

function EmptyPanel() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-sm text-text-secondary">No document open.</p>
      <p className="text-xs text-text-muted">
        Open a PDF to rearrange, rotate, split, or combine its pages.
      </p>
    </div>
  );
}

interface PanelBodyProps {
  mode: PanelMode;
  context: ActionContext;
  selection: ReturnType<typeof useOrganizeSelection>;
  thumbnails: ReturnType<typeof usePageThumbnails>;
  /** The page the viewer is on, selected and scrolled to as the panel opens. */
  openOn: number;
  onDropBefore(page: number): void;
  onLeaveMode(label: string, work: () => Promise<string>): void;
  onCancel(): void;
}

function PanelBody({ mode, context, selection, thumbnails, openOn, ...handlers }: PanelBodyProps) {
  const { session, busy } = context;

  if (mode === 'split') {
    return (
      <SplitView
        session={session}
        busy={busy}
        onCancel={handlers.onCancel}
        onSplit={(ranges) =>
          handlers.onLeaveMode('Splitting document', () => splitDocument(session.id, ranges))
        }
      />
    );
  }

  if (mode === 'combine') {
    return (
      <CombineView
        session={session}
        busy={busy}
        onCancel={handlers.onCancel}
        onCombine={(sources: MergeSource[]) =>
          handlers.onLeaveMode('Combining files', () => combineDocuments(sources))
        }
      />
    );
  }

  return (
    <>
      <OrganizeToolbar title="Pages" actions={pageActions(context)} />
      <PageGrid
        session={session}
        selection={selection.selection}
        thumbnails={thumbnails}
        openOn={openOn}
        onSelect={selection.select}
        onDragPage={selection.beginDrag}
        onDropBefore={handlers.onDropBefore}
      />
      <OrganizeToolbar title="Prepare for production" actions={productionActions(context)} />
    </>
  );
}

/** A drag that changed nothing never reaches the main process. */
function applyDrag(
  session: DocumentSession,
  selection: ReturnType<typeof useOrganizeSelection>,
  runner: ReturnType<typeof useOpsRunner>,
  beforePage: number
): void {
  const moved = selection.dragging();
  if (moved.size === 0) return;
  const order = moveSelectionBefore(session.pageCount, moved, beforePage);
  if (isSameOrder(order)) return;
  selection.followOrder(order, moved);
  void runner.run('Rearranging pages', () => reorderPages(session.id, order));
}

function OrganizeBody({ session }: { session: DocumentSession }) {
  const runner = useOpsRunner(session.id);
  const thumbnails = usePageThumbnails(session);
  // The page on screen as the panel opened; it does not chase the viewer after
  // that, or the attorney's own selection would be overwritten as he scrolls.
  const [openOn] = useState(useViewerApi()?.currentPage ?? 1);
  const selection = useOrganizeSelection(openOn, session.pageCount);
  const [mode, setMode] = useState<PanelMode>('pages');

  const context: ActionContext = {
    session,
    selected: selection.selected,
    busy: runner.busy !== null,
    run: (label, work) => void runner.run(label, work),
    openSplit: () => setMode('split'),
    openCombine: () => setMode('combine'),
  };

  const leaveMode = (label: string, work: () => Promise<string>): void => {
    setMode('pages');
    void runner.run(label, work);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        pageCount={session.pageCount}
        selectedCount={selection.selected.length}
        onSelectAll={() => selection.selectAll(session.pageCount)}
        onClear={selection.clear}
      />

      <PanelBody
        mode={mode}
        context={context}
        selection={selection}
        thumbnails={thumbnails}
        openOn={openOn}
        onDropBefore={(page) => applyDrag(session, selection, runner, page)}
        onLeaveMode={leaveMode}
        onCancel={() => setMode('pages')}
      />

      <OrganizeStatus
        busy={runner.busy}
        progress={runner.progress}
        notice={runner.notice}
        error={runner.error ?? thumbnails.failed}
        onDismiss={runner.dismiss}
      />
    </div>
  );
}

export function OrganizePanel() {
  const session = useActiveSession();

  if (session === null) return <EmptyPanel />;
  return <OrganizeBody key={session.id} session={session} />;
}

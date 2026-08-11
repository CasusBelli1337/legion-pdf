/**
 * Everything the panel needs, assembled: the marked state, the overlay it draws
 * on the page, the pointer drags that create it, the search that marks in bulk,
 * and the run that destroys it.
 *
 * Keeping the wiring here keeps the panel a layout file, and keeps the parts it
 * wires small enough to test on their own.
 */

import { createElement, useCallback, useEffect } from 'react';
import type { RedactionBox } from '@shared/types';
import { useViewerApi } from '@renderer/components/viewer';
import type { ViewerApi } from '@renderer/components/viewer';
import { useActiveSession } from '@renderer/app/store';
import { MarkOverlay, REDACT_OVERLAY_ID } from './mark-overlay';
import { pagesOf, useRedactionStore, verifyStringsOf } from './redaction-store';
import { useMarkDrag } from './use-mark-drag';
import type { MarkDrag } from './use-mark-drag';
import { useRedactApply } from './use-redact-apply';
import type { RedactApplyController } from './use-redact-apply';
import { useRedactSearch } from './use-redact-search';
import type { RedactSearch } from './use-redact-search';

export interface RedactionController {
  docId: string | null;
  marks: RedactionBox[];
  selectedId: string | null;
  pages: number[];
  drawing: boolean;
  reOcr: boolean;
  busy: boolean;
  drag: MarkDrag;
  search: RedactSearch;
  run: RedactApplyController;
  setDrawing(drawing: boolean): void;
  setReOcr(reOcr: boolean): void;
  selectMark(id: string | null): void;
  removeMark(id: string): void;
  clearMarks(): void;
  markAllMatches(): void;
  apply(): void;
}

interface OverlayInputs {
  marks: readonly RedactionBox[];
  selectedId: string | null;
  drawing: boolean;
  drag: MarkDrag;
}

/** Mount the marks over the pages through the viewer's overlay seam. */
function useMarkOverlay(api: ViewerApi | null, inputs: OverlayInputs): void {
  const { marks, selectedId, drawing, drag } = inputs;
  useEffect(() => {
    if (api === null) return;
    return api.registerOverlay(REDACT_OVERLAY_ID, (context) =>
      createElement(MarkOverlay, { context, marks, selectedId, drawing, drag })
    );
  }, [api, drag, drawing, marks, selectedId]);
}

/** Delete removes the selected mark — unless the attorney is typing in a field. */
function useDeleteKey(selectedId: string | null, remove: (id: string) => void): void {
  useEffect(() => {
    if (selectedId === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const tag = (event.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      event.preventDefault();
      remove(selectedId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [remove, selectedId]);
}

export function useRedaction(): RedactionController {
  const session = useActiveSession();
  const api = useViewerApi();
  const docId = session?.id ?? null;

  const store = useRedactionStore();
  const { addMark, updateMark, selectMark, forDocument } = store;

  useEffect(() => forDocument(docId), [docId, forDocument]);

  const drag = useMarkDrag(api, { addMark, updateMark, selectMark });
  const search = useRedactSearch(api);
  const run = useRedactApply(docId);
  const busy = run.state.phase === 'running';

  useMarkOverlay(api, {
    marks: store.marks,
    selectedId: store.selectedId,
    drawing: store.drawing && !busy,
    drag,
  });
  useDeleteKey(busy ? null : store.selectedId, store.removeMark);

  const markAllMatches = useCallback((): void => {
    store.markMatches(search.matches);
    search.clear();
  }, [search, store]);

  const apply = useCallback((): void => {
    run.apply({
      boxes: store.marks,
      verifyStrings: verifyStringsOf(store.marks),
      reOcr: store.reOcr,
    });
  }, [run, store.marks, store.reOcr]);

  // The receipt belongs to the run, so the panel must not be reset by the tab
  // switch that opening the redacted document causes.

  return {
    docId,
    marks: store.marks,
    selectedId: store.selectedId,
    pages: pagesOf(store.marks),
    drawing: store.drawing,
    reOcr: store.reOcr,
    busy,
    drag,
    search,
    run,
    setDrawing: store.setDrawing,
    setReOcr: store.setReOcr,
    selectMark: store.selectMark,
    removeMark: store.removeMark,
    clearMarks: store.clearMarks,
    markAllMatches,
    apply,
  };
}

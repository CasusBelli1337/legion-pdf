/**
 * Walks the exhibit label back and forward with the document's own history.
 *
 * Undo takes the stamp off the page. If the label box did not follow, the next
 * stamp would land as EXHIBIT D on a document whose last exhibit is B — the
 * quiet kind of numbering error that is only found in a deposition.
 *
 * The app store broadcasts every undo/redo that ACTUALLY applied, carrying the
 * op tag the main process stored with the bytes (see ./exhibit-form's
 * `#seam:label-undo-tag`). Anything that is not a labelled change is ignored.
 */

import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAppStore } from '@renderer/app/store';
import { afterHistoryStep, type ExhibitPanelState } from './exhibit-form';

export function useLabelHistory(
  docId: string,
  apply: Dispatch<SetStateAction<ExhibitPanelState>>
): void {
  const event = useAppStore((state) => state.lastHistoryEvent);
  // Whatever had already happened before this panel mounted is history it has
  // no business replaying — only steps taken while it is on screen count.
  const seen = useRef(event?.seq ?? 0);

  useEffect(() => {
    if (event === null || event.seq <= seen.current) return;
    seen.current = event.seq;
    if (event.docId !== docId) return;
    apply((state) => afterHistoryStep(state, event));
  }, [apply, docId, event]);
}

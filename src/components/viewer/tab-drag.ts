/**
 * #seam:tab-drag — dragging a tab onto the reference pane.
 *
 * The tab bar (src/app/shell/tab-bar.tsx) is the drag SOURCE and the reference
 * pane is the target, in two different zones with no shared component between
 * them. One named data type binds the two sites, so the seam is greppable
 * rather than a string typed twice.
 *
 * A browser hides `getData` during dragover — only `types` is readable — so the
 * two questions are separate: "is this a tab?" during the drag, "which tab?" on
 * the drop.
 */

export const TAB_DRAG_TYPE = 'application/x-legion-pdf-tab';

/** True while a tab (rather than a file from Explorer) is being dragged. */
export function hasTabDrag(transfer: Pick<DataTransfer, 'types'>): boolean {
  return [...transfer.types].includes(TAB_DRAG_TYPE);
}

/** The dropped tab's document id, or null when the drop carried something else. */
export function tabDragId(transfer: Pick<DataTransfer, 'types' | 'getData'>): string | null {
  if (!hasTabDrag(transfer)) return null;
  const docId = transfer.getData(TAB_DRAG_TYPE).trim();
  return docId.length > 0 ? docId : null;
}

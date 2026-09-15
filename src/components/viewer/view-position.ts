/**
 * Turning a scroll offset into "page 5, four tenths of the way down" and back.
 * Pure arithmetic over the virtualizer's measured rows, so the tab-switch rule
 * — come back to the SAME SPOT, not the top of the same page — is unit tested.
 */

import type { ViewPosition } from './page-restore';

/** One measured page row: where it starts in the scroll run and how tall it is. */
export interface PageRow {
  index: number;
  start: number;
  size: number;
}

/** The position under the viewport's top edge, from the rows currently measured. */
export function positionAt(scrollTop: number, rows: readonly PageRow[]): ViewPosition | null {
  const row = rows.find((candidate) => candidate.start + candidate.size > scrollTop + 8);
  if (row === undefined) return null;
  const offset = row.size > 0 ? (scrollTop - row.start) / row.size : 0;
  return { page: row.index + 1, offset: Math.min(1, Math.max(0, offset)) };
}

/** The scroll offset that puts `position` under the viewport's top edge. */
export function scrollTopFor(position: ViewPosition, row: PageRow): number {
  return Math.max(0, row.start + Math.min(1, Math.max(0, position.offset)) * row.size);
}

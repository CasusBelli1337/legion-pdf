/**
 * How wide the side panels are, and how that survives a restart.
 *
 * Pure arithmetic plus two localStorage keys, kept away from the components so
 * the clamps are tested rather than eyeballed. Widths are read SYNCHRONOUSLY
 * when a panel first renders, so a saved width is on screen in the first frame
 * — a panel that starts at its default and jumps a moment later is exactly the
 * flicker this is meant to avoid.
 */

export interface PanelSize {
  /** localStorage key the width is filed under. */
  storageKey: string;
  min: number;
  max: number;
  /** Where a double-click on the handle puts it back to. */
  preferred: number;
}

/** The right rail: page thumbnails and bookmarks. */
export const RAIL_SIZE: PanelSize = {
  storageKey: 'legion-pdf.rail-width',
  min: 140,
  max: 420,
  preferred: 176,
};

/** The left tool dock's panel — Organize, Bates, Redaction and the rest. */
export const DOCK_SIZE: PanelSize = {
  storageKey: 'legion-pdf.dock-width',
  min: 260,
  max: 560,
  preferred: 320,
};

export function clampWidth(size: PanelSize, width: number): number {
  if (!Number.isFinite(width)) return size.preferred;
  return Math.round(Math.min(size.max, Math.max(size.min, width)));
}

/** The saved width, or the default when nothing is saved or it is nonsense. */
export function readWidth(size: PanelSize, storage: Storage | null): number {
  if (storage === null) return size.preferred;
  try {
    const raw = storage.getItem(size.storageKey);
    if (raw === null) return size.preferred;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? clampWidth(size, parsed) : size.preferred;
  } catch {
    return size.preferred;
  }
}

export function writeWidth(size: PanelSize, storage: Storage | null, width: number): void {
  if (storage === null) return;
  try {
    storage.setItem(size.storageKey, String(clampWidth(size, width)));
  } catch {
    // A full or blocked storage is not a reason to refuse to resize a panel.
  }
}

/** Which way dragging the handle makes the panel wider. */
export type GrowDirection = 'left' | 'right';

/**
 * The width a drag has reached. The handle sits on the panel's INNER border,
 * so a rail on the right grows as the pointer moves left, and a dock on the
 * left grows as it moves right.
 */
export function widthFromDrag(
  size: PanelSize,
  grow: GrowDirection,
  startWidth: number,
  deltaX: number
): number {
  return clampWidth(size, startWidth + (grow === 'left' ? -deltaX : deltaX));
}

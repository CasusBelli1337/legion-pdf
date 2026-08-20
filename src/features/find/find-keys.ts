/**
 * What a key means in the find bar. Pure, so the wrap-around is tested rather
 * than argued about: Up and Down walk the hit list and take the viewer with
 * them, Enter is still "next", and Escape closes.
 */

export type FindKeyAction = 'search' | 'next' | 'previous' | 'close' | null;

export interface FindKey {
  key: string;
  /** A modified arrow is the OS's business (word jump, selection), not ours. */
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** Keys that only mean something once there are hits to walk. */
const WHEN_FOUND: Record<string, FindKeyAction> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
};

function isModified(event: FindKey): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.altKey === true;
}

function onEnter(event: FindKey, hasMatches: boolean): FindKeyAction {
  if (!hasMatches) return 'search';
  return event.shiftKey === true ? 'previous' : 'next';
}

/**
 * Enter searches when nothing has been found yet and steps to the next hit once
 * something has — the way every find bar an attorney has ever used behaves.
 */
export function findKeyAction(event: FindKey, hasMatches: boolean): FindKeyAction {
  if (isModified(event)) return null;
  if (event.key === 'Escape') return 'close';
  if (event.key === 'Enter') return onEnter(event, hasMatches);
  return hasMatches ? (WHEN_FOUND[event.key] ?? null) : null;
}

/** The hit the arrow keys land on, wrapping at both ends. */
export function stepIndex(active: number, direction: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  const from = active < 0 ? (direction === 1 ? -1 : 0) : active;
  return (from + direction + count) % count;
}

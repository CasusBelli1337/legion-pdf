/**
 * Per-document edit history behind Undo/Redo.
 *
 * Every mutation in this app replaces a document's whole byte array (core/
 * functions are pure: bytes in, bytes out), so history is a stack of the
 * versions that came before, each labelled with the op that stepped away from
 * it. Nothing is copied — an entry holds the very buffer the store already
 * held, so the only cost is keeping it alive.
 *
 * Depth is capped because those buffers are whole PDFs: a scanned deposition
 * runs 50-200 MB, so an uncapped history would grow without bound on a long
 * stamping session. Ten steps back is deeper than an attorney reaches after a
 * mis-click and bounded enough to reason about.
 */

import type { UndoState } from '@shared/types';

/** Snapshots kept per document, oldest dropped first. */
export const UNDO_DEPTH = 10;

/** An empty snapshot would restore a 0-byte document — never a silent outcome. */
export class EmptySnapshotError extends Error {
  readonly code = 'EMPTY_SNAPSHOT';
  constructor(action: string) {
    super(`Refusing to ${action} an empty (0 byte) version of the document.`);
    this.name = 'EmptySnapshotError';
  }
}

/**
 * One version in the history. `tag` names the op that moved the document ACROSS
 * this boundary — the change an undo of this entry takes back, and the change a
 * redo of it puts back — so a lane can roll its own UI state to match the bytes
 * (`'exhibit:A'` tells the exhibit panel which label to restore). Undefined
 * when the change was made without a tag, which is every op that has not asked
 * for one.
 */
export interface HistoryEntry {
  /** The document as it stood at this point. Never empty. */
  bytes: Uint8Array;
  tag?: string;
}

export class DocumentHistory {
  /** Versions before the current one, oldest first. */
  private readonly past: HistoryEntry[] = [];
  /** Versions undone away, ready to be stepped forward into. */
  private readonly future: HistoryEntry[] = [];

  constructor(private readonly depth: number = UNDO_DEPTH) {}

  /**
   * Records the bytes a mutation is about to replace, under the tag of the
   * mutation making the replacement. A new edit invalidates the redo stack:
   * those versions can no longer be reached from here.
   */
  record(priorBytes: Uint8Array, tag?: string): void {
    if (priorBytes.byteLength === 0) throw new EmptySnapshotError('record');
    this.past.push({ bytes: priorBytes, tag });
    if (this.past.length > this.depth) this.past.shift();
    this.future.length = 0;
  }

  /**
   * The entry an undo would land on, without moving the history. The caller
   * checks that version before committing, so a restore that fails validation
   * leaves the stacks exactly where they were.
   */
  peekBack(): HistoryEntry | null {
    return this.past.at(-1) ?? null;
  }

  /** The entry a redo would land on, without moving the history. */
  peekForward(): HistoryEntry | null {
    return this.future.at(-1) ?? null;
  }

  /** The version before `currentBytes`, or null when there is nothing to undo. */
  stepBack(currentBytes: Uint8Array): HistoryEntry | null {
    return this.step(this.past, this.future, currentBytes);
  }

  /** The version undone away most recently, or null when there is nothing to redo. */
  stepForward(currentBytes: Uint8Array): HistoryEntry | null {
    return this.step(this.future, this.past, currentBytes);
  }

  /** Drops every snapshot — used when the document leaves the store. */
  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }

  get state(): UndoState {
    return { canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
  }

  /**
   * Both directions are the same move: pop the version being stepped to, and
   * push what was current onto the opposite stack. Neither stack can outgrow
   * the depth, because a step only ever moves one entry across.
   *
   * The tag rides across with it. It labels the boundary between the two
   * versions, not either one of them, so undoing and redoing the same change
   * always reports the same tag.
   */
  private step(
    from: HistoryEntry[],
    to: HistoryEntry[],
    currentBytes: Uint8Array
  ): HistoryEntry | null {
    const restored = from.pop();
    if (restored === undefined) return null;
    if (restored.bytes.byteLength === 0) throw new EmptySnapshotError('restore');
    if (currentBytes.byteLength === 0) throw new EmptySnapshotError('step away from');
    to.push({ bytes: currentBytes, tag: restored.tag });
    return restored;
  }
}

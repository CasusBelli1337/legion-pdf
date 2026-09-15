/**
 * The pending combine list, held outside the panel component.
 *
 * It has to outlive the panel: Explorer's Combine verb can arrive while the
 * attorney is on another tool, the dock unmounts the panel the moment he
 * switches tools, and combining opens the result in a NEW tab — which would
 * throw away a list he spent a minute arranging, and the receipt proving what
 * just happened, at the exact moment he wanted to read it.
 */

import { create } from 'zustand';
import type { DocumentSession, ProgressEvent } from '@shared/types';
import {
  entryForPath,
  entryForSession,
  moveBefore,
  moveBy,
  newEntries,
  type CombineEntry,
} from './combine-list';

/** The finished combine: what to tell the attorney, and what to save. */
export interface CombineReceipt {
  docId: string;
  message: string;
}

export interface CombineState {
  entries: CombineEntry[];
  /** What the panel is doing right now, or null when idle. */
  busy: string | null;
  progress: ProgressEvent | null;
  receipt: CombineReceipt | null;
  error: string | null;
  /** A plain aside, e.g. files skipped because they were already listed. */
  notice: string | null;

  addPaths(paths: readonly string[]): void;
  addSessions(sessions: readonly DocumentSession[]): void;
  remove(key: string): void;
  nudge(index: number, direction: -1 | 1): void;
  dropBefore(from: number, beforeIndex: number): void;
  clear(): void;

  begin(label: string): void;
  setProgress(progress: ProgressEvent): void;
  finish(receipt: CombineReceipt): void;
  fail(message: string): void;
  note(message: string): void;
  dismiss(): void;
}

function skippedNotice(offered: number, added: number): string | null {
  const skipped = offered - added;
  if (skipped <= 0) return null;
  return skipped === 1
    ? 'One file was already in the list, so it was not added again.'
    : `${skipped} files were already in the list, so they were not added again.`;
}

/** Changing the list retires the last receipt — it describes a different job. */
function appended(state: CombineState, additions: readonly CombineEntry[]): Partial<CombineState> {
  const fresh = newEntries(state.entries, additions);
  return {
    entries: [...state.entries, ...fresh],
    notice: skippedNotice(additions.length, fresh.length),
    receipt: null,
    error: null,
  };
}

export const useCombineStore = create<CombineState>((set) => ({
  entries: [],
  busy: null,
  progress: null,
  receipt: null,
  error: null,
  notice: null,

  addPaths: (paths) => set((state) => appended(state, paths.map(entryForPath))),
  addSessions: (sessions) => set((state) => appended(state, sessions.map(entryForSession))),

  remove: (key) =>
    set((state) => ({ entries: state.entries.filter((entry) => entry.key !== key) })),
  nudge: (index, direction) =>
    set((state) => ({ entries: moveBy(state.entries, index, direction) })),
  dropBefore: (from, beforeIndex) =>
    set((state) => ({ entries: moveBefore(state.entries, from, beforeIndex) })),
  clear: () => set({ entries: [], receipt: null, error: null, notice: null, progress: null }),

  begin: (label) => set({ busy: label, progress: null, error: null, notice: null, receipt: null }),
  setProgress: (progress) => set({ progress }),
  finish: (receipt) => set({ busy: null, progress: null, receipt, error: null }),
  fail: (message) => set({ busy: null, progress: null, error: message }),
  note: (message) => set({ notice: message, error: null }),
  dismiss: () => set({ error: null, notice: null, receipt: null }),
}));

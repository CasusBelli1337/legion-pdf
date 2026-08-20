/**
 * App shell state. zustand over a Context+reducer: feature lanes can subscribe
 * to one slice (`useAppStore((s) => s.zoom)`) without re-rendering a 2,000-page
 * viewer whenever an unrelated field changes, and they can read state outside
 * React (`useAppStore.getState()`) from raster/IPC callbacks — both of which a
 * single Context provider makes awkward.
 */

import { create } from 'zustand';
import type { DocumentSession } from '@shared/types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const ZOOM_STEP = 0.1;

/**
 * An undo/redo that ACTUALLY applied, broadcast to whoever cares. A lane
 * subscribes to roll its own panel state back in step with the document —
 * `tag` says which change moved (e.g. 'exhibit:A'), and `seq` increments on
 * every event so two identical steps in a row are still two events.
 */
export interface HistoryEvent {
  docId: string;
  direction: 'undo' | 'redo';
  /** Op tag of the change undone/redone; undefined when it carried none. */
  tag?: string;
  seq: number;
}

export interface AppState {
  sessions: DocumentSession[];
  activeId: string | null;
  activeToolId: string | null;
  currentPage: number;
  zoom: number;
  /** Plain-English message for the status footer. Never a stack trace. */
  error: string | null;
  /** What the app is doing right now, e.g. "Opening 2 of 3". Drives the pulse. */
  busy: string | null;
  /** Transient informational line, e.g. the version readout from Help. */
  notice: string | null;
  /** The last undo/redo that applied. Null until one does. */
  lastHistoryEvent: HistoryEvent | null;

  openSession(session: DocumentSession): void;
  replaceSession(session: DocumentSession): void;
  closeSession(docId: string): void;
  setActive(docId: string): void;
  setActiveTool(toolId: string | null): void;
  setCurrentPage(page: number): void;
  setZoom(zoom: number): void;
  nudgeZoom(direction: 1 | -1): void;
  setError(message: string | null): void;
  setBusy(message: string | null): void;
  setNotice(message: string | null): void;
  /** Announces an applied undo/redo; the store stamps the sequence number. */
  noteHistoryEvent(event: Omit<HistoryEvent, 'seq'>): void;
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
}

export const useAppStore = create<AppState>((set) => ({
  sessions: [],
  activeId: null,
  activeToolId: null,
  currentPage: 1,
  zoom: 1,
  error: null,
  busy: null,
  notice: null,
  lastHistoryEvent: null,

  openSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions.filter((item) => item.id !== session.id), session],
      activeId: session.id,
      currentPage: 1,
      error: null,
    })),

  replaceSession: (session) =>
    set((state) => ({
      sessions: state.sessions.map((item) => (item.id === session.id ? session : item)),
    })),

  closeSession: (docId) =>
    set((state) => {
      const sessions = state.sessions.filter((item) => item.id !== docId);
      const activeId = state.activeId === docId ? (sessions.at(-1)?.id ?? null) : state.activeId;
      return { sessions, activeId, currentPage: 1 };
    }),

  setActive: (docId) => set({ activeId: docId, currentPage: 1 }),
  setActiveTool: (toolId) => set({ activeToolId: toolId }),
  setCurrentPage: (page) => set({ currentPage: Math.max(1, Math.trunc(page)) }),
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  nudgeZoom: (direction) =>
    set((state) => ({ zoom: clampZoom(state.zoom + direction * ZOOM_STEP) })),
  setError: (message) => set({ error: message }),
  setBusy: (message) => set({ busy: message }),
  setNotice: (message) => set({ notice: message }),
  noteHistoryEvent: (event) =>
    set((state) => ({
      lastHistoryEvent: { ...event, seq: (state.lastHistoryEvent?.seq ?? 0) + 1 },
    })),
}));

/** The document in the foreground tab, or null when nothing is open. */
export function useActiveSession(): DocumentSession | null {
  return useAppStore((state) => state.sessions.find((item) => item.id === state.activeId) ?? null);
}

/** Bytes for a document id — used by the raster bridge, outside React. */
export function getSessionBytes(docId: string): Uint8Array | undefined {
  return useAppStore.getState().sessions.find((item) => item.id === docId)?.bytes;
}

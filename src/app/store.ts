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

/** The shell's data. `EMPTY` below is one of these, so a new field cannot be
 *  declared without also being given a starting value. */
export interface AppData {
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
  /** Which document earned the notice; null means it is about the app itself. */
  noticeDocId: string | null;
  /** Which document the error is about; null means it is about the app itself. */
  errorDocId: string | null;
  /** The last undo/redo that applied. Null until one does. */
  lastHistoryEvent: HistoryEvent | null;
  /** True while the viewer is split into a working pane and a reference pane. */
  isSplitOpen: boolean;
  /**
   * The document in the RIGHT (reference) pane. Never the active document: one
   * file cannot be open in both panes, so every path that would make them equal
   * clears this instead. The left pane stays the active tab, which is what every
   * tool, the thumbnail rail and every shortcut keep pointing at.
   */
  splitDocId: string | null;
  /** Keeps the reference pane on the page number the working pane is on. */
  isSplitSynced: boolean;
}

export interface AppActions {
  openSession(session: DocumentSession): void;
  replaceSession(session: DocumentSession): void;
  closeSession(docId: string): void;
  setActive(docId: string): void;
  setActiveTool(toolId: string | null): void;
  setCurrentPage(page: number): void;
  setZoom(zoom: number): void;
  nudgeZoom(direction: 1 | -1): void;
  /**
   * `docId` says who the message belongs to: omitted means the document in
   * front right now, and an explicit `null` means the app itself (a version
   * readout, a file that would not open) so it survives a tab switch.
   */
  setError(message: string | null, docId?: string | null): void;
  setBusy(message: string | null): void;
  setNotice(message: string | null, docId?: string | null): void;
  /** Announces an applied undo/redo; the store stamps the sequence number. */
  noteHistoryEvent(event: Omit<HistoryEvent, 'seq'>): void;
  /** Side by side on/off. Opening with nothing chosen picks another open tab. */
  toggleSplit(): void;
  /** Shows a document in the reference pane; the active one swaps panes instead. */
  setSplitDoc(docId: string | null): void;
  /** Exchanges the two panes: the reference document becomes the working one. */
  swapSplit(): void;
  setSplitSynced(synced: boolean): void;
}

export interface AppState extends AppData, AppActions {}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
}

/** Messages the footer is showing, and which document each one is about. */
type Messages = Pick<AppState, 'error' | 'errorDocId' | 'notice' | 'noticeDocId'>;

/** Who a message belongs to: the caller's answer, or whatever tab is in front. */
function ownerOf(state: AppState, docId: string | null | undefined): string | null {
  return docId === undefined ? state.activeId : docId;
}

/**
 * A receipt belongs to the document that earned it. Bringing another document
 * forward drops every message about the one being left, so "Stamped ASHFORDQA…
 * on 500 pages" can never sit in the footer under a different file (F-6).
 * App-wide messages carry no owner and are left alone.
 */
function forOtherDocuments(state: AppState, activeId: string | null): Partial<Messages> {
  const stale = (owner: string | null): boolean => owner !== null && owner !== activeId;
  return {
    ...(stale(state.noticeDocId) ? { notice: null, noticeDocId: null } : {}),
    ...(stale(state.errorDocId) ? { error: null, errorDocId: null } : {}),
  };
}

/** A reference pane can never hold the document the working pane is showing. */
function referenceBeside(splitDocId: string | null, activeId: string | null): string | null {
  return splitDocId === activeId ? null : splitDocId;
}

/** A newly opened document takes the foreground, and clears what came before. */
function opened(state: AppState, session: DocumentSession): Partial<AppState> {
  return {
    sessions: [...state.sessions.filter((item) => item.id !== session.id), session],
    activeId: session.id,
    splitDocId: referenceBeside(state.splitDocId, session.id),
    currentPage: 1,
    ...forOtherDocuments(state, session.id),
    error: null,
    errorDocId: null,
  };
}

/** Closing a tab hands the foreground to the one behind it, messages and all. */
function closed(state: AppState, docId: string): Partial<AppState> {
  const sessions = state.sessions.filter((item) => item.id !== docId);
  const activeId = state.activeId === docId ? (sessions.at(-1)?.id ?? null) : state.activeId;
  return {
    sessions,
    activeId,
    // A closed document leaves the reference pane with it; so does one that has
    // just been handed the foreground.
    splitDocId: state.splitDocId === docId ? null : referenceBeside(state.splitDocId, activeId),
    currentPage: 1,
    ...forOtherDocuments(state, activeId),
  };
}

/** The document a fresh split opens on: the one used before the current tab. */
function neighbourOf(state: AppState): string | null {
  return state.sessions.filter((item) => item.id !== state.activeId).at(-1)?.id ?? null;
}

/**
 * Opening the split keeps whatever was on the right last time, as long as it is
 * still open and is not the document now in front; otherwise it picks a
 * neighbour. With only one document open it opens empty, and the pane says so.
 */
function splitToggled(state: AppState): Partial<AppState> {
  if (state.isSplitOpen) return { isSplitOpen: false };
  const kept = referenceBeside(state.splitDocId, state.activeId);
  const stillOpen = state.sessions.some((item) => item.id === kept);
  return { isSplitOpen: true, splitDocId: stillOpen ? kept : neighbourOf(state) };
}

/** The two panes trade places; the reference document becomes the active tab. */
function swapped(state: AppState): Partial<AppState> {
  const { activeId, splitDocId } = state;
  if (activeId === null || splitDocId === null) return {};
  return {
    activeId: splitDocId,
    splitDocId: activeId,
    currentPage: 1,
    ...forOtherDocuments(state, splitDocId),
  };
}

/**
 * Bringing a tab forward. Asking for the document that is already in the
 * reference pane swaps the panes rather than showing it twice — which is also
 * what dropping the active tab onto the reference pane means.
 */
function activated(state: AppState, docId: string): Partial<AppState> {
  if (state.isSplitOpen && docId === state.splitDocId) return swapped(state);
  return { activeId: docId, currentPage: 1, ...forOtherDocuments(state, docId) };
}

/** Nothing open, nothing said, nothing split. */
const EMPTY: AppData = {
  sessions: [],
  activeId: null,
  activeToolId: null,
  currentPage: 1,
  zoom: 1,
  error: null,
  busy: null,
  notice: null,
  noticeDocId: null,
  errorDocId: null,
  lastHistoryEvent: null,
  isSplitOpen: false,
  splitDocId: null,
  isSplitSynced: false,
};

export const useAppStore = create<AppState>((set) => ({
  ...EMPTY,

  openSession: (session) => set((state) => opened(state, session)),

  replaceSession: (session) =>
    set((state) => ({
      sessions: state.sessions.map((item) => (item.id === session.id ? session : item)),
    })),

  closeSession: (docId) => set((state) => closed(state, docId)),

  setActive: (docId) => set((state) => activated(state, docId)),
  setActiveTool: (toolId) => set({ activeToolId: toolId }),
  setCurrentPage: (page) => set({ currentPage: Math.max(1, Math.trunc(page)) }),
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  nudgeZoom: (direction) =>
    set((state) => ({ zoom: clampZoom(state.zoom + direction * ZOOM_STEP) })),
  setError: (message, docId) =>
    set((state) => ({
      error: message,
      errorDocId: message === null ? null : ownerOf(state, docId),
    })),
  setBusy: (message) => set({ busy: message }),
  setNotice: (message, docId) =>
    set((state) => ({
      notice: message,
      noticeDocId: message === null ? null : ownerOf(state, docId),
    })),
  noteHistoryEvent: (event) =>
    set((state) => ({
      lastHistoryEvent: { ...event, seq: (state.lastHistoryEvent?.seq ?? 0) + 1 },
    })),
  toggleSplit: () => set(splitToggled),
  setSplitDoc: (docId) =>
    set((state) =>
      docId === null
        ? { splitDocId: null }
        : docId === state.activeId
          ? swapped(state)
          : { isSplitOpen: true, splitDocId: docId }
    ),
  swapSplit: () => set(swapped),
  setSplitSynced: (synced) => set({ isSplitSynced: synced }),
}));

/** True when a message with this owner belongs on screen right now. */
function isCurrent(state: AppState, owner: string | null): boolean {
  return owner === null || owner === state.activeId;
}

/**
 * The footer's two lines, filtered to the document in front. An op that lands
 * while the attorney is reading another tab reports there and nowhere else.
 */
export function useScopedNotice(): string | null {
  return useAppStore((state) => (isCurrent(state, state.noticeDocId) ? state.notice : null));
}

export function useScopedError(): string | null {
  return useAppStore((state) => (isCurrent(state, state.errorDocId) ? state.error : null));
}

/** The document in the foreground tab, or null when nothing is open. */
export function useActiveSession(): DocumentSession | null {
  return useAppStore((state) => state.sessions.find((item) => item.id === state.activeId) ?? null);
}

/** The document in the reference pane, or null when the split is empty or shut. */
export function useSplitSession(): DocumentSession | null {
  return useAppStore((state) =>
    state.isSplitOpen ? (state.sessions.find((item) => item.id === state.splitDocId) ?? null) : null
  );
}

/** Bytes for a document id — used by the raster bridge, outside React. */
export function getSessionBytes(docId: string): Uint8Array | undefined {
  return useAppStore.getState().sessions.find((item) => item.id === docId)?.bytes;
}

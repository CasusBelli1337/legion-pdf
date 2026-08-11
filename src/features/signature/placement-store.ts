/**
 * Signatures placed on a page but NOT yet written into the file.
 *
 * This is the whole point of the F-6 rework: a signature the attorney drops on
 * a page is a live object they own — select it, drag it, resize it, delete it —
 * right up until they save. Nothing here has touched the PDF bytes, so a
 * document closed without saving carries no signature at all.
 *
 * Held outside the panel, keyed by document, for the reason the redaction store
 * is: a dock panel unmounts the moment the attorney switches tools, and work
 * that vanished because someone looked at the Bates tab would be worse than no
 * work at all. Keying by document (rather than holding one document's worth)
 * is what lets placements survive a TAB switch too — the attorney signs page 4
 * of one exhibit, checks another, comes back, and the signature is still there.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { PdfPoint, SignatureAsset } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { DEFAULT_SIGNATURE_HEIGHT, sizeFor } from './placement-geometry';

/** A signature parked on a page, not yet in the document's bytes. */
export interface LivePlacement {
  id: string;
  /** The document this belongs to. Never rendered on any other. */
  docId: string;
  /** The library entry, carried whole so the overlay can draw the image. */
  signature: SignatureAsset;
  page: number;
  /** Bottom-left corner as displayed, in PDF user space. */
  at: PdfPoint;
  widthPt: number;
  heightPt: number;
  /** Stamp today's date beside this one. Per placement, never global. */
  withDate: boolean;
  dateFormat: string;
}

export const DEFAULT_DATE_FORMAT = 'MM/DD/YYYY';

export interface PlacementState {
  placements: LivePlacement[];
  selectedId: string | null;

  place(docId: string, signature: SignatureAsset, page: number, at: PdfPoint): string;
  moveTo(id: string, at: PdfPoint): void;
  resizeTo(id: string, heightPt: number): void;
  setDate(id: string, patch: { withDate?: boolean; dateFormat?: string }): void;
  remove(id: string): void;
  select(id: string | null): void;
  clearDocument(docId: string): void;
  /** Drops placements for documents that are no longer open. */
  retainDocuments(docIds: readonly string[]): void;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `placement-${counter}`;
}

/** Every live placement on one document, in the order they were dropped. */
export function placementsFor(
  placements: readonly LivePlacement[],
  docId: string | null
): LivePlacement[] {
  return docId === null ? [] : placements.filter((placement) => placement.docId === docId);
}

function patch(
  state: PlacementState,
  id: string,
  change: (placement: LivePlacement) => LivePlacement
): Partial<PlacementState> {
  return {
    placements: state.placements.map((placement) =>
      placement.id === id ? change(placement) : placement
    ),
  };
}

export const usePlacementStore = create<PlacementState>((set) => ({
  placements: [],
  selectedId: null,

  place: (docId, signature, page, at) => {
    const id = nextId();
    const size = sizeFor(signature, DEFAULT_SIGNATURE_HEIGHT);
    set((state) => ({
      placements: [
        ...state.placements,
        {
          id,
          docId,
          signature,
          page,
          at,
          ...size,
          withDate: false,
          dateFormat: DEFAULT_DATE_FORMAT,
        },
      ],
      selectedId: id,
    }));
    return id;
  },

  moveTo: (id, at) => set((state) => patch(state, id, (placement) => ({ ...placement, at }))),

  resizeTo: (id, heightPt) =>
    set((state) =>
      patch(state, id, (placement) => ({
        ...placement,
        ...sizeFor(placement.signature, heightPt),
      }))
    ),

  setDate: (id, change) =>
    set((state) => patch(state, id, (placement) => ({ ...placement, ...change }))),

  remove: (id) =>
    set((state) => ({
      placements: state.placements.filter((placement) => placement.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  select: (selectedId) => set({ selectedId }),

  clearDocument: (docId) =>
    set((state) => keeping(state, (placement) => placement.docId !== docId)),

  retainDocuments: (docIds) =>
    set((state) => keeping(state, (placement) => docIds.includes(placement.docId))),
}));

/**
 * A cull that returns the SAME state when nothing was culled. Every op on a
 * document replaces the session list, so this runs constantly; a fresh array
 * every time would re-render every overlay for nothing.
 */
function keeping(
  state: PlacementState,
  keep: (placement: LivePlacement) => boolean
): Partial<PlacementState> {
  const placements = state.placements.filter(keep);
  if (placements.length === state.placements.length) return state;
  const survived = placements.some((placement) => placement.id === state.selectedId);
  return { placements, selectedId: survived ? state.selectedId : null };
}

/** Live placements on a document, as a subscribing hook. */
export function useLivePlacements(docId: string | null): LivePlacement[] {
  return usePlacementStore(useShallow((state) => placementsFor(state.placements, docId)));
}

/** How many signatures are waiting on a document — the close-guard's number. */
export function liveSignatureCount(docId: string | null): number {
  return placementsFor(usePlacementStore.getState().placements, docId).length;
}

/** The same count as a hook, for any surface that wants to say so out loud. */
export function useLiveSignatureCount(docId: string | null): number {
  return usePlacementStore((state) => placementsFor(state.placements, docId).length);
}

/**
 * Closing a tab drops its placements — they were never in the file, and
 * carrying them onto whatever document takes the foreground next is how the
 * wrong page gets signed. Wired to the session list rather than to the close
 * action so EVERY route out of a document (close, crash of a tab, a lane that
 * replaces the session list wholesale) is covered by one rule.
 */
useAppStore.subscribe((state, previous) => {
  if (state.sessions === previous.sessions) return;
  usePlacementStore.getState().retainDocuments(state.sessions.map((session) => session.id));
});

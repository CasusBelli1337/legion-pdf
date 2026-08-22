/**
 * Form field values typed into the page but NOT yet written into the file.
 *
 * Held outside the viewer because both of its homes are disposable: a page's
 * annotation layer unmounts when it scrolls out of view, and pdf.js's own
 * annotationStorage dies with its document proxy on every edit. This store is
 * the one copy that survives both, keyed by document so edits survive a tab
 * switch too. Values reach the bytes through the fill gate at save time.
 */

import { create } from 'zustand';
import { useAppStore } from '@renderer/app/store';

/** Field name → its new value. Booleans are checkboxes; strings everything else. */
export type FieldEdits = Readonly<Record<string, string | boolean>>;

export interface FormState {
  /** docId → pending edits. Absent docId = nothing pending. */
  edits: Readonly<Record<string, FieldEdits>>;
  /** docId → how many fillable fields the document has, once known. */
  fieldCounts: Readonly<Record<string, number>>;

  /** Replace one document's pending edits wholesale (the storage fold). */
  replaceEdits(docId: string, edits: FieldEdits): void;
  setFieldCount(docId: string, count: number): void;
  clearDocument(docId: string): void;
  retainDocuments(docIds: readonly string[]): void;
}

function shallowEqual(a: FieldEdits, b: FieldEdits): boolean {
  const aKeys = Object.keys(a);
  return aKeys.length === Object.keys(b).length && aKeys.every((key) => a[key] === b[key]);
}

export const useFormStore = create<FormState>((set) => ({
  edits: {},
  fieldCounts: {},

  replaceEdits: (docId, edits) =>
    set((state) => {
      const current = state.edits[docId] ?? {};
      if (shallowEqual(current, edits)) return state;
      if (Object.keys(edits).length === 0) {
        const { [docId]: _dropped, ...rest } = state.edits;
        return { edits: rest };
      }
      return { edits: { ...state.edits, [docId]: edits } };
    }),

  setFieldCount: (docId, count) =>
    set((state) =>
      state.fieldCounts[docId] === count
        ? state
        : { fieldCounts: { ...state.fieldCounts, [docId]: count } }
    ),

  clearDocument: (docId) =>
    set((state) => {
      const { [docId]: _edits, ...edits } = state.edits;
      return { edits };
    }),

  retainDocuments: (docIds) =>
    set((state) => {
      const stale = (id: string): boolean => !docIds.includes(id);
      if (!Object.keys(state.edits).some(stale) && !Object.keys(state.fieldCounts).some(stale)) {
        return state;
      }
      const keep = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
        Object.fromEntries(Object.entries(record).filter(([id]) => !stale(id)));
      return { edits: keep(state.edits), fieldCounts: keep(state.fieldCounts) };
    }),
}));

/** One document's pending edits, outside React. */
export function editsFor(docId: string | null): FieldEdits {
  return docId === null ? {} : (useFormStore.getState().edits[docId] ?? {});
}

/** True when this document has typed answers that are not in the file yet. */
export function hasPendingFormEdits(docId: string | null): boolean {
  return Object.keys(editsFor(docId)).length > 0;
}

/** The pending-edit count as a hook, for the panel and the close guard copy. */
export function usePendingFormEditCount(docId: string | null): number {
  return useFormStore((state) =>
    docId === null ? 0 : Object.keys(state.edits[docId] ?? {}).length
  );
}

/** The fillable-field count as a hook; null until the document reports it. */
export function useFormFieldCount(docId: string | null): number | null {
  return useFormStore((state) => (docId === null ? null : (state.fieldCounts[docId] ?? null)));
}

/**
 * Closing a tab drops its edits; same one-rule wiring as the signature lane —
 * every route out of a document is covered by watching the session list.
 */
useAppStore.subscribe((state, previous) => {
  if (state.sessions === previous.sessions) return;
  useFormStore.getState().retainDocuments(state.sessions.map((session) => session.id));
});

/**
 * The signature request being assembled: who signs, and which boxes on which
 * pages belong to them. Nothing here touches the PDF bytes — fields are
 * request metadata that leave the app inside `esign:createRequest` (hosted
 * links) or `esign:exportFillable` (an AcroForm copy for Acrobat users).
 *
 * Held outside the panel and keyed by document for the same reason the
 * signature placement store is: a dock panel unmounts on every tool switch,
 * and a half-built request must survive both tool and tab switches. Receipts
 * from sent requests live here too, so "who has signed" stays on screen.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  EsignEnvelopeStatus,
  EsignField,
  EsignFieldKind,
  EsignReceipt,
  EsignSigner,
  PdfRect,
} from '@shared/types';
import { useAppStore } from '@renderer/app/store';

/** A signer being edited in the panel, tied to the document they will sign. */
export interface RequestSigner extends EsignSigner {
  docId: string;
}

/** A placed field, tied to its document. */
export interface RequestField extends EsignField {
  docId: string;
}

/** One request that has gone out, with the freshest status the service gave. */
export interface SentRequest {
  docId: string;
  receipt: EsignReceipt;
  status: EsignEnvelopeStatus | null;
}

export interface EsignRequestState {
  signers: RequestSigner[];
  fields: RequestField[];
  sent: SentRequest[];
  selectedFieldId: string | null;
  /** The field kind armed for click-to-place, or null when nothing is armed. */
  placing: EsignFieldKind | null;

  addSigner(docId: string, name: string, email: string): string;
  updateSigner(id: string, patch: { name?: string; email?: string }): void;
  /** Removing a signer removes every field that belonged to them. */
  removeSigner(id: string): void;

  addField(docId: string, field: Omit<EsignField, 'id'>): string;
  moveField(id: string, rect: PdfRect): void;
  updateField(id: string, patch: { label?: string; required?: boolean; signerId?: string }): void;
  removeField(id: string): void;
  selectField(id: string | null): void;
  setPlacing(kind: EsignFieldKind | null): void;

  recordSent(docId: string, receipt: EsignReceipt): void;
  recordStatus(envelopeId: string, status: EsignEnvelopeStatus): void;

  clearRequest(docId: string): void;
  /** Drops request state for documents that are no longer open. */
  retainDocuments(docIds: readonly string[]): void;
}

/**
 * Ids travel to the signing service, where they must be unique per envelope —
 * a counter would repeat across app launches, so every id is a real UUID.
 * The prefix only makes debugging output readable.
 */
function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function forDoc<T extends { docId: string }>(items: readonly T[], docId: string | null): T[] {
  return docId === null ? [] : items.filter((item) => item.docId === docId);
}

/* Reducer helpers, hoisted app-store-style so the creator stays reviewable. */

function withoutSigner(state: EsignRequestState, id: string): Partial<EsignRequestState> {
  return {
    signers: state.signers.filter((signer) => signer.id !== id),
    fields: state.fields.filter((field) => field.signerId !== id),
  };
}

function withoutField(state: EsignRequestState, id: string): Partial<EsignRequestState> {
  return {
    fields: state.fields.filter((field) => field.id !== id),
    selectedFieldId: state.selectedFieldId === id ? null : state.selectedFieldId,
  };
}

function withStatus(
  state: EsignRequestState,
  envelopeId: string,
  status: EsignEnvelopeStatus
): Partial<EsignRequestState> {
  return {
    sent: state.sent.map((entry) =>
      entry.receipt.envelopeId === envelopeId ? { ...entry, status } : entry
    ),
  };
}

function cleared(state: EsignRequestState, docId: string): Partial<EsignRequestState> {
  return {
    signers: state.signers.filter((signer) => signer.docId !== docId),
    fields: state.fields.filter((field) => field.docId !== docId),
    selectedFieldId: null,
    placing: null,
  };
}

function retained(
  state: EsignRequestState,
  docIds: readonly string[]
): Partial<EsignRequestState> | EsignRequestState {
  const keep = (item: { docId: string }): boolean => docIds.includes(item.docId);
  const fields = state.fields.filter(keep);
  const signers = state.signers.filter(keep);
  const sent = state.sent.filter(keep);
  if (
    fields.length === state.fields.length &&
    signers.length === state.signers.length &&
    sent.length === state.sent.length
  ) {
    return state;
  }
  const survived = fields.some((field) => field.id === state.selectedFieldId);
  return { fields, signers, sent, selectedFieldId: survived ? state.selectedFieldId : null };
}

export const useEsignStore = create<EsignRequestState>((set) => ({
  signers: [],
  fields: [],
  sent: [],
  selectedFieldId: null,
  placing: null,

  addSigner: (docId, name, email) => {
    const id = nextId('signer');
    set((state) => ({ signers: [...state.signers, { id, docId, name, email }] }));
    return id;
  },

  updateSigner: (id, change) =>
    set((state) => ({
      signers: state.signers.map((signer) =>
        signer.id === id ? { ...signer, ...change } : signer
      ),
    })),

  removeSigner: (id) => set((state) => withoutSigner(state, id)),

  addField: (docId, field) => {
    const id = nextId('field');
    set((state) => ({
      fields: [...state.fields, { ...field, id, docId }],
      selectedFieldId: id,
    }));
    return id;
  },

  moveField: (id, rect) =>
    set((state) => ({
      fields: state.fields.map((field) => (field.id === id ? { ...field, rect } : field)),
    })),

  updateField: (id, change) =>
    set((state) => ({
      fields: state.fields.map((field) => (field.id === id ? { ...field, ...change } : field)),
    })),

  removeField: (id) => set((state) => withoutField(state, id)),

  selectField: (selectedFieldId) => set({ selectedFieldId }),

  setPlacing: (placing) => set({ placing }),

  recordSent: (docId, receipt) =>
    set((state) => ({ sent: [...state.sent, { docId, receipt, status: null }] })),

  recordStatus: (envelopeId, status) => set((state) => withStatus(state, envelopeId, status)),

  clearRequest: (docId) => set((state) => cleared(state, docId)),

  retainDocuments: (docIds) => set((state) => retained(state, docIds)),
}));

/** The signers on one document, in the order they were added. */
export function useEsignSigners(docId: string | null): RequestSigner[] {
  return useEsignStore(useShallow((state) => forDoc(state.signers, docId)));
}

/** The fields placed on one document. */
export function useEsignFields(docId: string | null): RequestField[] {
  return useEsignStore(useShallow((state) => forDoc(state.fields, docId)));
}

/** Requests already sent for one document, newest last. */
export function useSentRequests(docId: string | null): SentRequest[] {
  return useEsignStore(useShallow((state) => forDoc(state.sent, docId)));
}

/**
 * Closing a tab drops its request draft — fields placed on a document that is
 * gone must never land on whatever takes the foreground next. Wired to the
 * session list so every route out of a document is covered by one rule.
 */
useAppStore.subscribe((state, previous) => {
  if (state.sessions === previous.sessions) return;
  useEsignStore.getState().retainDocuments(state.sessions.map((session) => session.id));
});

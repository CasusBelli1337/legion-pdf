/**
 * The bridge between one pdf.js document proxy and this lane's stores.
 *
 * Every edit op hands the viewer a NEW proxy with an EMPTY annotationStorage,
 * so typed answers would vanish on the first rotate or stamp. The session —
 * built once per proxy, cached on the proxy itself — re-seeds that storage
 * from the form store before any page renders its widgets, and folds storage
 * back into the store whenever the attorney types. The store is the truth;
 * pdf.js's storage is a per-proxy working copy.
 */

import { useEffect } from 'react';
import type { PDFDocumentProxy } from '@renderer/lib/pdfjs';
import { fieldNameCount, foldStorage, storageSeeds, widgetsOf } from './field-map';
import type { FormWidget, RawFieldObject } from './field-map';
import { editsFor, useFormStore } from './form-store';

export interface FormSession {
  widgets: readonly FormWidget[];
}

const sessions = new WeakMap<PDFDocumentProxy, Promise<FormSession>>();

async function buildSession(document: PDFDocumentProxy, docId: string): Promise<FormSession> {
  const fieldObjects = (await document.getFieldObjects()) as Record<
    string,
    RawFieldObject[]
  > | null;
  const widgets = fieldObjects === null ? [] : widgetsOf(fieldObjects);
  useFormStore.getState().setFieldCount(docId, fieldNameCount(widgets));
  for (const [id, value] of storageSeeds(widgets, editsFor(docId))) {
    document.annotationStorage.setValue(id, value);
  }
  return { widgets };
}

/**
 * The session for this proxy, building (and seeding) it on first ask. Both the
 * viewer state and every page's annotation layer await the same promise, so
 * seeding always finishes before the first widget is on screen.
 */
export function formSessionFor(document: PDFDocumentProxy, docId: string): Promise<FormSession> {
  let session = sessions.get(document);
  if (session === undefined) {
    session = buildSession(document, docId);
    sessions.set(document, session);
  }
  return session;
}

/**
 * Build (and seed) the session as soon as the viewer has a proxy, so the
 * field count is known before any widget page scrolls into view.
 */
export function useFormSession(document: PDFDocumentProxy | null, docId: string): void {
  useEffect(() => {
    if (document !== null) void formSessionFor(document, docId);
  }, [document, docId]);
}

/**
 * Fold what pdf.js's inputs have written into annotationStorage back into the
 * form store. Wired to input/change events on each page's annotation layer.
 */
export function syncStorageIntoStore(
  session: FormSession,
  document: PDFDocumentProxy,
  docId: string
): void {
  const edits = foldStorage(session.widgets, (id) => {
    const raw = document.annotationStorage.getRawValue(id) as { value?: unknown } | undefined;
    return raw;
  });
  useFormStore.getState().replaceEdits(docId, edits);
}

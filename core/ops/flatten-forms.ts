/**
 * Form bookkeeping for flattening. Once a widget's appearance is painted into
 * the page, the interactive form entry behind it has to go too — otherwise a
 * reader rebuilds the field (and, with /NeedAppearances, redraws it) and the
 * "flattened" signature is editable again.
 */

import { PDFArray, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import type { PDFDocument, PDFObject } from 'pdf-lib';

const MAX_FIELD_NODES = 20_000;

function fieldRefs(document: PDFDocument, fields: PDFArray | undefined): PDFRef[] {
  const found: PDFRef[] = [];
  const queue: PDFObject[] = [];
  for (let index = 0; fields !== undefined && index < fields.size(); index += 1) {
    queue.push(fields.get(index));
  }
  while (queue.length > 0 && found.length < MAX_FIELD_NODES) {
    const next = queue.shift();
    if (!(next instanceof PDFRef)) continue;
    found.push(next);
    const kids = document.context
      .lookupMaybe(next, PDFDict)
      ?.lookupMaybe(PDFName.of('Kids'), PDFArray);
    for (let index = 0; kids !== undefined && index < kids.size(); index += 1) {
      queue.push(kids.get(index));
    }
  }
  return found;
}

/** Drops the whole interactive form. Used when every page was flattened. */
export function removeAcroForm(document: PDFDocument): void {
  const key = PDFName.of('AcroForm');
  const formRef = document.catalog.get(key);
  const form = document.catalog.lookupMaybe(key, PDFDict);
  for (const ref of fieldRefs(document, form?.lookupMaybe(PDFName.of('Fields'), PDFArray))) {
    document.context.delete(ref);
  }
  document.catalog.delete(key);
  if (formRef instanceof PDFRef) document.context.delete(formRef);
}

function pruneArray(array: PDFArray | undefined, removed: ReadonlySet<string>): void {
  for (let index = (array?.size() ?? 0) - 1; index >= 0; index -= 1) {
    const entry = array?.get(index);
    if (entry instanceof PDFRef && removed.has(entry.tag)) array?.remove(index);
  }
}

/**
 * Removes flattened widgets from the form when only SOME pages were flattened,
 * so the surviving fields keep working and no entry points at a deleted object.
 */
export function pruneFormFields(document: PDFDocument, removed: ReadonlySet<string>): void {
  const form = document.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (form === undefined || removed.size === 0) return;
  const fields = form.lookupMaybe(PDFName.of('Fields'), PDFArray);
  pruneArray(fields, removed);
  for (const ref of fieldRefs(document, fields)) {
    const kids = document.context
      .lookupMaybe(ref, PDFDict)
      ?.lookupMaybe(PDFName.of('Kids'), PDFArray);
    pruneArray(kids, removed);
  }
  form.delete(PDFName.of('NeedAppearances'));
}

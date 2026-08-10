/**
 * Embedded file attachments — the quiet way a privileged spreadsheet rides
 * along inside a produced PDF. Production hygiene (F-9) always reports what it
 * found; removing them is opt-in, because dropping an exhibit attachment
 * without being asked would be its own kind of data loss.
 */

import { PDFArray, PDFDict, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib';
import type { PDFDocument, PDFObject } from 'pdf-lib';

const MAX_TREE_DEPTH = 32;
const FILE_ATTACHMENT = 'FileAttachment';

function collectNameTree(node: PDFDict | undefined, depth: number, into: PDFObject[]): void {
  if (node === undefined || depth > MAX_TREE_DEPTH) return;
  const names = node.lookupMaybe(PDFName.of('Names'), PDFArray);
  for (let index = 1; names !== undefined && index < names.size(); index += 2) {
    into.push(names.get(index));
  }
  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
  for (let index = 0; kids !== undefined && index < kids.size(); index += 1) {
    collectNameTree(kids.lookupMaybe(index, PDFDict), depth + 1, into);
  }
}

function embeddedFileSpecs(document: PDFDocument): PDFObject[] {
  const names = document.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const specs: PDFObject[] = [];
  collectNameTree(names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict), 0, specs);
  return specs;
}

function attachmentAnnotations(document: PDFDocument): { page: number; ref: PDFRef }[] {
  const found: { page: number; ref: PDFRef }[] = [];
  document.getPages().forEach((page, index) => {
    const annots = page.node.Annots();
    for (let position = 0; annots !== undefined && position < annots.size(); position += 1) {
      const ref = annots.get(position);
      const annotation = annots.lookupMaybe(position, PDFDict);
      const subtype = annotation?.lookupMaybe(PDFName.of('Subtype'), PDFName);
      if (ref instanceof PDFRef && subtype?.decodeText() === FILE_ATTACHMENT) {
        found.push({ page: index + 1, ref });
      }
    }
  });
  return found;
}

/** How many embedded files the document carries, counted both ways they hide. */
export function countAttachments(document: PDFDocument): number {
  return embeddedFileSpecs(document).length + attachmentAnnotations(document).length;
}

function deleteFileSpec(document: PDFDocument, spec: PDFObject): void {
  const dict = spec instanceof PDFRef ? document.context.lookupMaybe(spec, PDFDict) : asDict(spec);
  const embedded = dict?.lookupMaybe(PDFName.of('EF'), PDFDict);
  for (const value of embedded?.values() ?? []) {
    if (value instanceof PDFRef) document.context.delete(value);
  }
  const streamRef = embedded?.get(PDFName.of('F'));
  if (streamRef instanceof PDFRef) document.context.delete(streamRef);
  if (spec instanceof PDFRef) document.context.delete(spec);
}

function asDict(object: PDFObject): PDFDict | undefined {
  return object instanceof PDFDict ? object : undefined;
}

function removeAnnotation(document: PDFDocument, pageIndex: number, ref: PDFRef): void {
  const annots = document.getPage(pageIndex).node.Annots();
  for (let position = (annots?.size() ?? 0) - 1; position >= 0; position -= 1) {
    if (annots?.get(position) === ref) annots.remove(position);
  }
  document.context.delete(ref);
}

/** Removes every embedded file and returns how many went. */
export function stripAttachments(document: PDFDocument): number {
  const specs = embeddedFileSpecs(document);
  for (const spec of specs) deleteFileSpec(document, spec);

  const names = document.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  names?.delete(PDFName.of('EmbeddedFiles'));
  document.catalog.delete(PDFName.of('AF'));

  const annotations = attachmentAnnotations(document);
  for (const annotation of annotations) {
    removeAnnotation(document, annotation.page - 1, annotation.ref);
  }
  return specs.length + annotations.length;
}

/** Attachment file names, for the plain-English warning the panel shows. */
export function attachmentNames(document: PDFDocument): string[] {
  return embeddedFileSpecs(document).map((spec, index) => {
    const dict =
      spec instanceof PDFRef ? document.context.lookupMaybe(spec, PDFDict) : asDict(spec);
    const name = dict?.lookupMaybe(PDFName.of('F'), PDFString, PDFHexString);
    return name?.decodeText() ?? `Attachment ${index + 1}`;
  });
}

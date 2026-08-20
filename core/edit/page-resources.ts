/**
 * Everything a page's operators can refer to by name: the faces it draws text
 * in and the form XObjects it stamps down.
 *
 * Forms are resolved here rather than inside the walker so the walker can stay
 * synchronous — a form is just another content stream with its own matrix and
 * its own resources, and it has to be READ even though this lane never rewrites
 * one: text hidden inside a form is still text a whiteout would be covering,
 * and leaving it unread is how hidden text leaks.
 */

import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib';
import type { PDFObject, PDFPage } from 'pdf-lib';
import { PRODUCT_NAME } from '@shared/product';
import { fontMetricsOf } from './font-widths';
import { IDENTITY, type Matrix } from './matrix';
import type { FormContent, ScanResources } from './text-runs';

/** Forms nest; this matches the walker's own ceiling. */
const MAX_DEPTH = 8;

function matrixOf(dictionary: PDFDict): Matrix {
  const values = dictionary.lookupMaybe(PDFName.of('Matrix'), PDFArray);
  if (values === undefined || values.size() !== 6) return IDENTITY;
  const [a, b, c, d, e, f] = Array.from({ length: 6 }, (_unused, index) =>
    values.lookupMaybe(index, PDFNumber)?.asNumber()
  );
  if (a === undefined || b === undefined || c === undefined) return IDENTITY;
  if (d === undefined || e === undefined || f === undefined) return IDENTITY;
  return [a, b, c, d, e, f];
}

async function formsOf(
  resources: PDFDict | undefined,
  depth: number
): Promise<Map<string, FormContent>> {
  const forms = new Map<string, FormContent>();
  const xobjects = resources?.lookupMaybe(PDFName.XObject, PDFDict);
  if (xobjects === undefined || depth >= MAX_DEPTH) return forms;
  for (const [key] of xobjects.entries()) {
    const stream = xobjects.lookupMaybe(key, PDFStream);
    if (!(stream instanceof PDFRawStream)) continue;
    if (stream.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() !== 'Form') continue;
    forms.set(key.decodeText(), {
      content: decodePDFRawStream(stream).decode(),
      matrix: matrixOf(stream.dict),
      resources: await resourcesOf(stream.dict.lookupMaybe(PDFName.Resources, PDFDict), depth + 1),
    });
  }
  return forms;
}

/** The faces and forms one resource dictionary names, ready for the walker. */
export async function resourcesOf(
  resources: PDFDict | undefined,
  depth = 0
): Promise<ScanResources> {
  return { fonts: await fontMetricsOf(resources), forms: await formsOf(resources, depth) };
}

export interface PageStream {
  /** The object this stream lives at, so an edit can replace it in place. */
  ref: PDFRef;
  dict: PDFDict;
  content: Uint8Array;
}

function streamAt(page: PDFPage, entry: PDFObject, pageNumber: number): PageStream {
  const stream = entry instanceof PDFRef ? page.doc.context.lookup(entry) : entry;
  if (!(entry instanceof PDFRef) || !(stream instanceof PDFRawStream)) {
    throw new UneditablePageError(
      `Page ${pageNumber} stores its drawing instructions in a form ${PRODUCT_NAME} cannot ` +
        'rewrite, so it cannot remove the text under the box. Use Redaction instead.'
    );
  }
  return { ref: entry, dict: stream.dict, content: decodePDFRawStream(stream).decode() };
}

/** Raised when a page's own bytes cannot be addressed for rewriting. */
export class UneditablePageError extends Error {
  override name = 'UneditablePageError';
}

/**
 * A page's content streams in drawing order, decoded, each with the reference
 * it can be written back to. `/Contents` is one stream or an array of them, and
 * the array's parts are one logical stream split across objects.
 */
export function contentStreamsOf(page: PDFPage, pageNumber: number): PageStream[] {
  const contents = page.node.get(PDFName.Contents);
  if (contents === undefined) return [];
  const entries = contents instanceof PDFArray ? contents.asArray() : [contents];
  return entries.map((entry) => streamAt(page, entry, pageNumber));
}

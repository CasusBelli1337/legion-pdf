/**
 * Flatten annotations into the page (F-9). Every annotation with a normal
 * appearance stream is painted into the page content at its rectangle; then
 * ALL annotation objects on the page are deleted, so nothing survives as an
 * object a reader could move, edit, or delete — signature and text-box widgets
 * included.
 *
 * Known limit, by design: annotations with no appearance stream (link
 * rectangles, popups) carry no ink, so they are removed rather than drawn.
 */

import {
  PDFDict,
  PDFName,
  PDFRef,
  PDFStream,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import type { PDFDocument, PDFPage } from 'pdf-lib';
import type { FlattenDetail, FlattenOptions, OpResult } from '@shared/types';
import {
  appearanceMatrix,
  appearanceStreamRef,
  ensureFormXObject,
  isHidden,
} from './flatten-appearance';
import { pruneFormFields, removeAcroForm } from './flatten-forms';
import { normalizePages } from './page-selection';
import { finish, loadPdf, type ProgressReporter } from './pdf-io';

interface PageFlattenResult {
  painted: number;
  removed: PDFRef[];
}

function paintAppearance(
  document: PDFDocument,
  page: PDFPage,
  annotation: PDFDict,
  name: string
): boolean {
  const streamRef = appearanceStreamRef(document, annotation);
  const stream =
    streamRef === undefined ? undefined : document.context.lookupMaybe(streamRef, PDFStream);
  if (streamRef === undefined || stream === undefined) return false;

  ensureFormXObject(stream);
  page.node.setXObject(PDFName.of(name), streamRef);
  const [a, b, c, d, e, f] = appearanceMatrix(annotation, stream);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(a, b, c, d, e, f),
    drawObject(name),
    popGraphicsState()
  );
  return true;
}

function flattenPage(document: PDFDocument, pageNumber: number): PageFlattenResult {
  const page = document.getPage(pageNumber - 1);
  const annotations = page.node.Annots();
  const result: PageFlattenResult = { painted: 0, removed: [] };
  if (annotations === undefined) return result;

  for (let index = 0; index < annotations.size(); index += 1) {
    const entry = annotations.get(index);
    const annotation = annotations.lookupMaybe(index, PDFDict);
    if (annotation !== undefined && !isHidden(annotation)) {
      const name = `LibrariusFlat${pageNumber}_${index}`;
      if (paintAppearance(document, page, annotation, name)) result.painted += 1;
    }
    if (entry instanceof PDFRef) result.removed.push(entry);
  }

  page.node.delete(PDFName.of('Annots'));
  for (const ref of result.removed) document.context.delete(ref);
  return result;
}

export async function flattenAnnotations(
  bytes: Uint8Array,
  options: FlattenOptions,
  onProgress?: ProgressReporter
): Promise<OpResult<FlattenDetail>> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const pages =
    options.pages === undefined
      ? document.getPageIndices().map((index) => index + 1)
      : normalizePages(options.pages, pagesIn, 'pages to flatten');

  let annotationsFlattened = 0;
  const removed = new Set<string>();
  pages.forEach((pageNumber, position) => {
    const result = flattenPage(document, pageNumber);
    annotationsFlattened += result.painted;
    for (const ref of result.removed) removed.add(ref.tag);
    onProgress?.(position + 1, pages.length);
  });

  if (pages.length === pagesIn) removeAcroForm(document);
  else pruneFormFields(document, removed);

  return finish(document, pagesIn, pagesIn, { annotationsFlattened }, 'flattened document');
}

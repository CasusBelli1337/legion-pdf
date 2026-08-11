/**
 * Which pages already carry a text layer, and which are just pictures of words?
 *
 * Detection runs in the MAIN process on the document bytes rather than in the
 * renderer through pdfjs: `ocr:detect` takes only a docId, and reading the
 * content streams needs no canvas, no worker, and no round-trip. It also sees
 * exactly what a later `ocr:run` would add, so re-running detect after a run is
 * an honest verification that the text layer landed.
 */

import { PDFArray, PDFDocument, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import type { OcrDetectResult } from '@shared/types';
import { countShownCharacters } from './content-text';
import { PRODUCT_NAME } from '@shared/product';

/**
 * Fewer shown characters than this and the page is treated as a scan. A page
 * whose only text is a stamped folio ("14") is still a page needing OCR.
 */
export const MIN_TEXT_LAYER_CHARS = 16;

/** Thrown when a page's content cannot be read, so it cannot be classified. */
export class ContentStreamError extends Error {
  readonly code = 'CONTENT_STREAM';
  constructor(message: string) {
    super(message);
    this.name = 'ContentStreamError';
  }
}

function decodeStream(stream: PDFStream, page: number): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  throw new ContentStreamError(
    `Page ${page} has a content stream ${PRODUCT_NAME} cannot decode (${stream.constructor.name}).`
  );
}

function contentStreamsOf(page: PDFPage, pageNumber: number): Uint8Array[] {
  const contents = page.node.Contents();
  if (contents === undefined) return [];
  if (contents instanceof PDFStream) return [decodeStream(contents, pageNumber)];
  if (contents instanceof PDFArray) {
    return contents
      .asArray()
      .map((entry) => page.doc.context.lookup(entry))
      .filter((entry): entry is PDFStream => entry instanceof PDFStream)
      .map((stream) => decodeStream(stream, pageNumber));
  }
  throw new ContentStreamError(`Page ${pageNumber} has an unreadable /Contents entry.`);
}

/** Characters the page shows, summed across all of its content streams. */
export function shownCharactersOnPage(page: PDFPage, pageNumber: number): number {
  return contentStreamsOf(page, pageNumber).reduce(
    (total, content) => total + countShownCharacters(content),
    0
  );
}

/**
 * Split a document into pages that already have text and pages that need OCR.
 * Every page lands in exactly one bucket — the counts must always add up.
 */
export async function detectTextLayer(
  bytes: Uint8Array,
  minChars: number = MIN_TEXT_LAYER_CHARS
): Promise<OcrDetectResult> {
  if (bytes.byteLength === 0) throw new ContentStreamError('The document is empty (0 bytes).');
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const pages = document.getPages();
  const pagesWithText: number[] = [];
  const pagesNeedingOcr: number[] = [];
  pages.forEach((page, index) => {
    const pageNumber = index + 1;
    const shown = shownCharactersOnPage(page, pageNumber);
    (shown >= minChars ? pagesWithText : pagesNeedingOcr).push(pageNumber);
  });
  const result: OcrDetectResult = { pageCount: pages.length, pagesWithText, pagesNeedingOcr };
  if (pagesWithText.length + pagesNeedingOcr.length !== pages.length) {
    throw new ContentStreamError('Text-layer detection lost pages — refusing to report a result.');
  }
  return result;
}

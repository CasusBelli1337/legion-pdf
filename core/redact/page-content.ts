/**
 * Reading one page's own content streams — the second, structure-aware half of
 * verification.
 *
 * The byte scan counts how often a term is left in the file. This asks the
 * narrower question that matters most: "does the rebuilt page draw any text at
 * all". A page rebuilt from a raster draws one image and nothing else, so zero
 * shown characters is a claim about the page that no encoding trick can dress
 * up — and it settles every marked rectangle on that page at once, because a
 * silent page has nothing readable anywhere, marked or not. It is checked
 * against the SAVED bytes, not the document we built.
 */

import { PDFArray, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import type { PDFDocument, PDFPage } from 'pdf-lib';
import { ContentStreamError, countShownCharacters } from '@core/ocr';
import { PRODUCT_NAME } from '@shared/product';

function decodeStream(stream: PDFStream, page: number): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  throw new ContentStreamError(
    `Page ${page} has a content stream ${PRODUCT_NAME} cannot decode (${stream.constructor.name}), ` +
      'so it cannot prove the page is clean.'
  );
}

/** Every decoded content stream of one page. An empty page has none. */
export function pageContentStreams(page: PDFPage, pageNumber: number): Uint8Array[] {
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

/** Characters the page's own operators show. Zero = the page draws no text. */
export function shownCharactersOn(document: PDFDocument, pageNumber: number): number {
  const page = document.getPage(pageNumber - 1);
  return pageContentStreams(page, pageNumber).reduce(
    (total, content) => total + countShownCharacters(content),
    0
  );
}

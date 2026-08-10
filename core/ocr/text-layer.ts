/**
 * The invisible text layer: what turns a picture of a page into a searchable,
 * selectable one. Each recognized word is drawn in text rendering mode 3
 * (invisible) at the position Tesseract found it, stretched by the text matrix
 * so the selection box matches the ink underneath in any viewer.
 *
 * Pure pdf-lib, no Electron, no DOM — the whole file is unit-testable.
 */

import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  concatTransformationMatrix,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib';
import type { PDFFont, PDFName, PDFOperator, PDFPage } from 'pdf-lib';
import type { OcrRunDetail, OpResult, PageSize } from '@shared/types';
import { characterCount } from './hocr-parser';
import { displaySize, displayToUserMatrix, rasterScale, wordRect } from './geometry';
import type { OcrPageWords, OcrWord } from './types';
import { EmptyOcrPageError } from './types';

/** Below this the font size is meaningless; a box that small is OCR noise. */
const MIN_FONT_SIZE = 0.5;
/** Clamp for the horizontal stretch, so one absurd box cannot warp a page. */
const MAX_STRETCH = 10;
const MIN_STRETCH = 0.01;

/** Characters the standard font cannot encode become this, never nothing. */
const REPLACEMENT = '?';
/** How far the raster's shape may drift from the page's before it is suspect. */
const ASPECT_TOLERANCE = 0.02;

/** Replace anything the font cannot encode; never silently drop a character. */
export function sanitizeToFont(text: string, charset: ReadonlySet<number>): string {
  return Array.from(text)
    .map((character) => (charset.has(character.codePointAt(0) ?? -1) ? character : REPLACEMENT))
    .join('');
}

function assertPagesRequested(pages: readonly OcrPageWords[], pageCount: number): void {
  if (pages.length === 0) {
    throw new RangeError('Refusing to write a text layer for zero pages.');
  }
  const seen = new Set<number>();
  for (const page of pages) {
    if (!Number.isInteger(page.page) || page.page < 1 || page.page > pageCount) {
      throw new RangeError(`Page ${page.page} is outside this ${pageCount}-page document.`);
    }
    if (seen.has(page.page)) throw new RangeError(`Page ${page.page} was recognized twice.`);
    seen.add(page.page);
    if (page.words.length === 0 && !page.blank) throw new EmptyOcrPageError(page.page);
  }
}

/**
 * A raster of the WRONG page still parses cleanly and still writes words — it
 * just puts every one of them in the wrong place. Comparing the image's shape
 * to the page's catches that before it silently corrupts the text layer.
 */
function assertRasterMatchesPage(display: PageSize, recognized: OcrPageWords): void {
  const pageRatio = display.width / display.height;
  const rasterRatio = recognized.widthPx / recognized.heightPx;
  if (Math.abs(pageRatio - rasterRatio) / pageRatio > ASPECT_TOLERANCE) {
    throw new RangeError(
      `Page ${recognized.page}: a ${recognized.widthPx}x${recognized.heightPx} image does not ` +
        `match a ${Math.round(display.width)}x${Math.round(display.height)} point page — ` +
        'refusing to place words from the wrong raster.'
    );
  }
}

function wordOperators(
  word: OcrWord,
  font: PDFFont,
  fontKey: PDFName,
  charset: ReadonlySet<number>,
  rect: { x: number; y: number; width: number; height: number }
): PDFOperator[] {
  const text = sanitizeToFont(word.text, charset);
  const size = Math.max(rect.height, MIN_FONT_SIZE);
  const natural = font.widthOfTextAtSize(text, size);
  if (text.length === 0 || natural <= 0 || rect.width <= 0) return [];
  const stretch = Math.min(MAX_STRETCH, Math.max(MIN_STRETCH, rect.width / natural));
  return [
    setFontAndSize(fontKey, size),
    setTextMatrix(stretch, 0, 0, 1, rect.x, rect.y),
    showText(font.encodeText(text)),
  ];
}

/** Every operator for one page, already in display space. */
function pageOperators(
  page: PDFPage,
  recognized: OcrPageWords,
  font: PDFFont,
  charset: ReadonlySet<number>
): PDFOperator[] {
  const crop = page.getCropBox();
  const rotation = page.getRotation().angle;
  const display = displaySize(rotation, crop);
  assertRasterMatchesPage(display, recognized);
  const { scaleX, scaleY } = rasterScale(display, recognized.widthPx, recognized.heightPx);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  const body = recognized.words.flatMap((word) =>
    wordOperators(word, font, fontKey, charset, wordRect(word.box, scaleX, scaleY, display))
  );
  if (body.length === 0) return [];
  return [
    pushGraphicsState(),
    concatTransformationMatrix(...displayToUserMatrix(rotation, crop)),
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
    ...body,
    endText(),
    popGraphicsState(),
  ];
}

/**
 * Draw the words. A blank page is not touched at all — no font, no content
 * stream, no change to bytes that carry no text.
 */
async function drawRecognizedPages(
  document: PDFDocument,
  pages: readonly OcrPageWords[]
): Promise<void> {
  const withWords = pages.filter((recognized) => recognized.words.length > 0);
  if (withWords.length === 0) return;
  const font = await document.embedFont(StandardFonts.Helvetica);
  const charset = new Set(font.getCharacterSet());
  for (const recognized of withWords) {
    const page = document.getPage(recognized.page - 1);
    const operators = pageOperators(page, recognized, font, charset);
    if (operators.length > 0) page.pushOperators(...operators);
  }
}

/**
 * Write an invisible text layer onto the recognized pages.
 *
 * Every requested page appears in the result: a blank page contributes zero
 * characters, and a page that produced nothing without being blank throws
 * instead of quietly counting as done.
 */
export async function writeTextLayer(
  bytes: Uint8Array,
  pages: readonly OcrPageWords[]
): Promise<OpResult<OcrRunDetail>> {
  if (bytes.byteLength === 0) throw new RangeError('Cannot write a text layer into 0 bytes.');
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const pagesIn = document.getPageCount();
  assertPagesRequested(pages, pagesIn);

  await drawRecognizedPages(document, pages);

  const output = await document.save();
  if (output.byteLength === 0) {
    throw new Error('Writing the text layer produced an empty document.');
  }
  return {
    bytes: output,
    pagesIn,
    pagesOut: document.getPageCount(),
    detail: {
      pagesOcred: pages.map((page) => page.page),
      charsPerPage: pages.map((page) => characterCount(page.words)),
    },
  };
}

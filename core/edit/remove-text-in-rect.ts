/**
 * Taking the text out from under a whiteout box.
 *
 * Painting a white rectangle over a paragraph hides it from the eye and from
 * nobody else: the words still copy out, still feed an AI prompt, still show up
 * in an opponent's text extraction. "Cover it and type over it" is only honest
 * if the covered characters actually stop existing on the page, so this deletes
 * the operators that draw them and leaves everything else — images, lines,
 * shading, and every glyph outside the box — byte for byte where it was.
 *
 * This is still NOT redaction. Redaction (core/redact) rebuilds the page from a
 * raster because a scan can carry the same words as pixels; this removes text
 * operators only, and says so.
 *
 * The function proves its own work before returning: it re-reads the rebuilt
 * streams, re-places every glyph, and refuses to report success while any
 * character still stands inside the rectangle.
 */

import { PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import type { PDFDocument, PDFPage } from 'pdf-lib';
import type { PdfRect } from '@shared/types';
import { countShownCharacters } from '@core/ocr';
import { PRODUCT_NAME } from '@shared/product';
import { contentStreamsOf, resourcesOf, type PageStream } from './page-resources';
import { COVERAGE_THRESHOLD, applyEdits, editFor, isCovered, type ShowEdit } from './rewrite-shows';
import { scanText, type ScanResources, type ScanResult } from './text-runs';

/** Text this lane can see but cannot rewrite — a loud stop, never a silent pass. */
export class UnreachableTextError extends Error {
  override name = 'UnreachableTextError';
}

/** The removal did not do what it claimed. Raised instead of returning. */
export class RemovalNotProvedError extends Error {
  override name = 'RemovalNotProvedError';
}

export interface RemovalDetail {
  /** Glyphs deleted from the page's own content streams. */
  glyphsRemoved: number;
  /** Show operators rewritten; the rest of the page was not touched. */
  operatorsRewritten: number;
  /** Characters the page's operators showed before the edit. */
  shownBefore: number;
  /** …and after. The difference is the count this op is accountable for. */
  shownAfter: number;
  /**
   * True when a face carried no width table and nominal widths were used. The
   * box may then take slightly more or less than a reader would draw; leaking
   * covered text is the worse failure, so the estimate errs towards removal.
   */
  approximateWidths: boolean;
}

interface Span {
  stream: PageStream;
  start: number;
  end: number;
}

/** The page's streams as ONE buffer, because they are one logical stream. */
function join(streams: readonly PageStream[]): { bytes: Uint8Array; spans: Span[] } {
  const spans: Span[] = [];
  let total = 0;
  for (const stream of streams) {
    spans.push({ stream, start: total, end: total + stream.content.length });
    total += stream.content.length + 1;
  }
  const bytes = new Uint8Array(Math.max(0, total - 1));
  for (const span of spans) {
    bytes.set(span.stream.content, span.start);
    if (span.end < bytes.length) bytes[span.end] = 0x0a;
  }
  return { bytes, spans };
}

function spanOf(spans: readonly Span[], edit: ShowEdit, pageNumber: number): Span {
  const span = spans.find((entry) => edit.start >= entry.start && edit.end <= entry.end);
  if (span === undefined) {
    throw new UnreachableTextError(
      `Page ${pageNumber} splits one drawing instruction across two content streams, which ` +
        `${PRODUCT_NAME} will not rewrite blind. Use Redaction instead.`
    );
  }
  return span;
}

function writeBack(page: PDFPage, stream: PageStream, bytes: Uint8Array): void {
  const context = page.doc.context;
  const dict = stream.dict.clone(context);
  dict.delete(PDFName.of('Filter'));
  dict.delete(PDFName.of('DecodeParms'));
  dict.set(PDFName.Length, PDFNumber.of(bytes.length));
  context.assign(stream.ref, PDFRawStream.of(dict, bytes));
}

function editsFor(scan: ScanResult, rect: PdfRect, threshold: number): ShowEdit[] {
  return scan.shows
    .map((operation) => editFor(operation, rect, threshold))
    .filter((edit): edit is ShowEdit => edit !== null);
}

function refuseHiddenText(scan: ScanResult, rect: PdfRect, threshold: number, page: number): void {
  const covered = scan.nested.filter((glyph) => isCovered(glyph, rect, threshold));
  if (covered.length === 0) return;
  throw new UnreachableTextError(
    `The text under this box on page ${page} is drawn inside a reusable graphic, which ` +
      `${PRODUCT_NAME} cannot edit. Nothing was changed — use Redaction to remove it for good.`
  );
}

/** Re-reads the page and refuses to return while any character stands in the box. */
function proveEmpty(
  page: PDFPage,
  pageNumber: number,
  resources: ScanResources,
  rect: PdfRect,
  threshold: number
): { shownAfter: number } {
  const joined = join(contentStreamsOf(page, pageNumber));
  const scan = scanText(joined.bytes, resources);
  const left = scan.shows
    .flatMap((operation) => operation.items)
    .flatMap((item) => (item.kind === 'glyphs' ? item.glyphs : []))
    .filter((glyph) => isCovered(glyph, rect, threshold));
  if (left.length > 0) {
    throw new RemovalNotProvedError(
      `${left.length} characters are still drawn inside the covered area on page ${pageNumber} ` +
        'after the removal — refusing to report the area as cleared.'
    );
  }
  return { shownAfter: countShownCharacters(joined.bytes) };
}

export interface RemovalRequest {
  /** 1-based page. */
  page: number;
  /** The covered area, in PDF user space — the same rectangle whiteout paints. */
  rect: PdfRect;
  /** Share of a glyph that must lie inside the box to delete it. */
  threshold?: number;
}

/**
 * Deletes every glyph the rectangle covers from one page of an OPEN document,
 * and returns the counts that prove it. The caller saves; nothing here writes
 * bytes to disk, so the change is undone by the ordinary byte history.
 */
export async function removeTextInRect(
  document: PDFDocument,
  request: RemovalRequest
): Promise<RemovalDetail> {
  const threshold = request.threshold ?? COVERAGE_THRESHOLD;
  const page = document.getPage(request.page - 1);
  const resources = await resourcesOf(page.node.Resources());
  const streams = contentStreamsOf(page, request.page);
  const joined = join(streams);
  const scan = scanText(joined.bytes, resources);
  refuseHiddenText(scan, request.rect, threshold, request.page);

  const edits = editsFor(scan, request.rect, threshold);
  const shownBefore = countShownCharacters(joined.bytes);
  for (const span of joined.spans) {
    const mine = edits
      .filter((edit) => spanOf(joined.spans, edit, request.page) === span)
      .map((edit) => ({ ...edit, start: edit.start - span.start, end: edit.end - span.start }));
    if (mine.length > 0) writeBack(page, span.stream, applyEdits(span.stream.content, mine));
  }

  const glyphsRemoved = edits.reduce((total, edit) => total + edit.glyphsRemoved, 0);
  const { shownAfter } = proveEmpty(page, request.page, resources, request.rect, threshold);
  assertCounts(edits, shownBefore, shownAfter, request.page);
  return {
    glyphsRemoved,
    operatorsRewritten: edits.length,
    shownBefore,
    shownAfter,
    approximateWidths: scan.approximate,
  };
}

/** The page must show exactly the characters the edits claimed to take out. */
function assertCounts(
  edits: readonly ShowEdit[],
  shownBefore: number,
  shownAfter: number,
  page: number
): void {
  const expected = edits.reduce((total, edit) => total + edit.bytesRemoved, 0);
  if (shownBefore - shownAfter === expected) return;
  throw new RemovalNotProvedError(
    `Page ${page} showed ${shownBefore} characters and now shows ${shownAfter}, a drop of ` +
      `${shownBefore - shownAfter} where ${expected} was expected — the edit is not trusted.`
  );
}

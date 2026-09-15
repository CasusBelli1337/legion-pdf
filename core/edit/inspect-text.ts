/**
 * "What paragraph did the attorney click?" — the read half of text editing.
 *
 * A click lands in PDF user space. This reads the page's own drawing
 * instructions, places every glyph, works out which line the click is on and
 * which lines belong with it, and reports the paragraph the way an editor
 * needs it: its text, its lines, its font and colour, its leading and
 * alignment. The same reading is repeated at commit time so an edit can prove
 * it is still rewriting the paragraph the attorney saw.
 *
 * Refusals are loud and in plain English: invisible OCR text over a scan, and
 * text drawn through a reusable form XObject, are both things this cannot
 * honestly rewrite.
 */

import type { PDFDocument, PDFPage } from 'pdf-lib';
import type { PdfPoint, PdfRect, TextEditBlock, TextEditProbe } from '@shared/types';
import { PRODUCT_NAME } from '@shared/product';
import { fontCodecsOf, type FontCodec } from './font-codec';
import { contentStreamsOf, resourcesOf } from './page-resources';
import { joinStreams, type JoinedStreams } from './remove-text-in-rect';
import {
  alignmentOf,
  fromFrame,
  groupLines,
  leadingOf,
  lineAt,
  paragraphAround,
  placedGlyphs,
  toFrame,
  type PlacedGlyph,
  type TextLine,
} from './text-lines';
import { scanText, type ScanResources, type ScanResult, type ShownGlyph } from './text-runs';

/** Text is there but cannot be edited honestly. The message is for the attorney. */
export class NoEditableTextError extends Error {
  override name = 'NoEditableTextError';
}

export interface PageText {
  page: PDFPage;
  pageNumber: number;
  resources: ScanResources;
  codecs: Map<string, FontCodec>;
  joined: JoinedStreams;
  scan: ScanResult;
  glyphs: PlacedGlyph[];
}

/** Everything the editor needs to know about one page's text, read once. */
export async function readPageText(document: PDFDocument, pageNumber: number): Promise<PageText> {
  const page = document.getPage(pageNumber - 1);
  const resourceDict = page.node.Resources();
  const resources = await resourcesOf(resourceDict);
  const joined = joinStreams(contentStreamsOf(page, pageNumber));
  const scan = scanText(joined.bytes, resources);
  return {
    page,
    pageNumber,
    resources,
    codecs: fontCodecsOf(resourceDict),
    joined,
    scan,
    glyphs: placedGlyphs(scan),
  };
}

const UNKNOWN = '�';

export function decoderFor(codecs: Map<string, FontCodec>): (glyph: PlacedGlyph) => string {
  return (glyph) => codecs.get(glyph.fontName)?.decode(glyph.code) ?? UNKNOWN;
}

function distance(box: PdfRect, at: PdfPoint): number {
  const dx = Math.max(box.x - at.x, 0, at.x - (box.x + box.width));
  const dy = Math.max(box.y - at.y, 0, at.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

function nearest<T extends ShownGlyph>(glyphs: readonly T[], at: PdfPoint): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const glyph of glyphs) {
    const gap = distance(glyph.box, at);
    if (gap < bestDistance) {
      best = glyph;
      bestDistance = gap;
    }
  }
  return best;
}

/** How far from any glyph a click may land and still mean that text. */
const REACH = 1.5;

function refuseFormText(pageText: PageText, at: PdfPoint, hit: PlacedGlyph | null): void {
  const reach = (hit?.size ?? 12) * REACH;
  const inForm = nearest(pageText.scan.nested, at);
  if (inForm === null || distance(inForm.box, at) > reach) return;
  if (hit !== null && distance(hit.box, at) <= distance(inForm.box, at)) return;
  throw new NoEditableTextError(
    `The text here is drawn inside a reusable graphic, which ${PRODUCT_NAME} cannot edit. ` +
      'Use Cover and retype instead.'
  );
}

function refuseInvisibleText(at: PdfPoint, hit: PlacedGlyph | null): void {
  if (hit === null || distance(hit.box, at) > hit.size * REACH) return;
  if (hit.renderMode !== 3 && hit.renderMode !== 7) return;
  throw new NoEditableTextError(
    'The words here are part of a scanned picture. The text underneath comes from text ' +
      'recognition and is invisible, so there is nothing to retype in place. Use Cover and retype.'
  );
}

/** The most common value in a list, ties to the first seen. */
function modeOf<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function boundsOfLines(lines: readonly TextLine[]): PdfRect {
  const boxes = lines.flatMap((line) => line.glyphs.map((glyph) => glyph.box));
  const left = Math.min(...boxes.map((box) => box.x));
  const bottom = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

export interface FoundBlock {
  block: TextEditBlock;
  lines: TextLine[];
  /** Every line on the page in this text direction, for column edges. */
  pageLines: TextLine[];
  angle: number;
  fontName: string;
  codec: FontCodec | undefined;
}

/** What an unreadable font reports: nothing known, nothing reusable. */
const NO_CODEC = {
  baseFont: '',
  bold: false,
  italic: false,
  family: 'serif',
  reusable: false,
} as const;

function fontOf(
  codec: FontCodec | undefined,
  glyphs: readonly PlacedGlyph[]
): TextEditBlock['font'] {
  const face = codec ?? NO_CODEC;
  return {
    documentFont: face.baseFont,
    sizePt: modeOf(glyphs.map((glyph) => glyph.size)) ?? 0,
    colorHex: modeOf(glyphs.map((glyph) => glyph.fillColor)) ?? '#000000',
    bold: face.bold,
    italic: face.italic,
    designFamily: face.family,
    reusable: face.reusable,
  };
}

function blockOf(found: Omit<FoundBlock, 'block'>, pageNumber: number): TextEditBlock {
  const glyphs = found.lines.flatMap((line) => line.glyphs);
  return {
    page: pageNumber,
    rect: boundsOfLines(found.lines),
    lines: found.lines.map((line) => ({
      text: line.text,
      origin: fromFrame({ along: line.start, across: line.baseline }, found.angle),
      width: line.end - line.start,
    })),
    text: found.lines.map((line) => line.text).join('\n'),
    font: fontOf(found.codec, glyphs),
    leadingPt: leadingOf(found.lines),
    alignment: alignmentOf(found.lines),
    angle: (found.angle * 180) / Math.PI,
  };
}

/** The paragraph under `at`, or null when the click is not on any text. */
export function findBlock(pageText: PageText, at: PdfPoint): FoundBlock | null {
  const hit = nearest(pageText.glyphs, at);
  refuseFormText(pageText, at, hit);
  refuseInvisibleText(at, hit);
  if (hit === null || distance(hit.box, at) > hit.size * REACH) return null;
  const decode = decoderFor(pageText.codecs);
  const pageLines = groupLines(pageText.glyphs, hit.angle, decode);
  const index = lineAt(pageLines, toFrame(at, hit.angle));
  if (index < 0) return null;
  const lines = paragraphAround(pageLines, index).flatMap((at) => pageLines[at] ?? []);
  const fontName =
    modeOf(lines.flatMap((line) => line.glyphs.map((glyph) => glyph.fontName))) ?? '';
  const partial = {
    lines,
    pageLines,
    angle: hit.angle,
    fontName,
    codec: pageText.codecs.get(fontName),
  };
  return { ...partial, block: blockOf(partial, pageText.pageNumber) };
}

export async function inspectTextAt(
  document: PDFDocument,
  probe: TextEditProbe
): Promise<TextEditBlock | null> {
  const pageCount = document.getPageCount();
  if (!Number.isInteger(probe.page) || probe.page < 1 || probe.page > pageCount) {
    throw new RangeError(
      `This document has pages 1 through ${pageCount}; there is no page ${probe.page}.`
    );
  }
  const pageText = await readPageText(document, probe.page);
  return findBlock(pageText, probe.at)?.block ?? null;
}

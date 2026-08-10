/**
 * TEST SUPPORT ONLY — never imported by shipping code. Fixture PDFs are built
 * here with pdf-lib so no binary fixtures live in git.
 *
 * `containsText` is the important one: pdf-lib compresses content streams and
 * writes text as hex, so grepping raw bytes for a marker silently "passes" on
 * documents that still contain it. This inflates every stream and checks all
 * three encodings a marker can wear, which is what makes the residue tests real.
 */

import { inflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  beginText,
  degrees,
  endText,
  moveText,
  setFontAndSize,
  showText,
} from 'pdf-lib';
import type { BookmarkNode } from '@shared/types';
import { writeOutline } from './bookmarks-write';

export interface TestPageSpec {
  label: string;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface TestPdfSpec {
  pages: TestPageSpec[];
  bookmarks?: BookmarkNode[];
  info?: Record<string, string>;
  /** Raw XMP packet, written uncompressed so tests can see it plainly. */
  xmp?: string;
  attachments?: { name: string; content: string }[];
}

/** Distinct page widths make page identity checkable without reading content. */
export function labelledPages(count: number, prefix = 'PAGE', baseWidth = 200): TestPageSpec[] {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `${prefix}-${index + 1}`,
    width: baseWidth + index,
    height: 300,
  }));
}

function applyInfo(document: PDFDocument, info: Record<string, string>): void {
  const setters: Record<string, (value: string) => void> = {
    Author: (value) => document.setAuthor(value),
    Title: (value) => document.setTitle(value),
    Subject: (value) => document.setSubject(value),
    Keywords: (value) => document.setKeywords([value]),
    Creator: (value) => document.setCreator(value),
    Producer: (value) => document.setProducer(value),
  };
  for (const [key, value] of Object.entries(info)) setters[key]?.(value);
}

export async function makeTestPdf(spec: TestPdfSpec): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const page of spec.pages) {
    const created = document.addPage([page.width ?? 300, page.height ?? 300]);
    created.drawText(page.label, { x: 20, y: 200, size: 18, font });
    if (page.rotation !== undefined) created.setRotation(degrees(page.rotation));
  }
  if (spec.info !== undefined) applyInfo(document, spec.info);
  if (spec.xmp !== undefined) {
    const stream = document.context.stream(spec.xmp, { Type: 'Metadata', Subtype: 'XML' });
    document.catalog.set(PDFName.of('Metadata'), document.context.register(stream));
  }
  for (const attachment of spec.attachments ?? []) {
    await document.attach(Buffer.from(attachment.content, 'utf8'), attachment.name);
  }
  if (spec.bookmarks !== undefined) writeOutline(document, spec.bookmarks);
  return document.save();
}

/**
 * An outline written the way OTHER producers write one — a /A GoTo action
 * pointing at a NAMED destination — so the reader is tested against something
 * our own writer did not produce.
 */
export async function withNamedDestinationOutline(
  bytes: Uint8Array,
  title: string,
  page: number
): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = document.context;
  const destination = PDFArray.withContext(context);
  destination.push(document.getPage(page - 1).ref);
  destination.push(PDFName.of('Fit'));

  const names = PDFArray.withContext(context);
  names.push(PDFString.of('chapter-one'));
  names.push(destination);
  const dests = PDFDict.withContext(context);
  dests.set(PDFName.of('Names'), names);
  const nameTree = PDFDict.withContext(context);
  nameTree.set(PDFName.of('Dests'), context.register(dests));
  document.catalog.set(PDFName.of('Names'), context.register(nameTree));

  const action = PDFDict.withContext(context);
  action.set(PDFName.of('S'), PDFName.of('GoTo'));
  action.set(PDFName.of('D'), PDFString.of('chapter-one'));

  const rootRef = context.nextRef();
  const item = PDFDict.withContext(context);
  item.set(PDFName.of('Title'), PDFHexString.fromText(title));
  item.set(PDFName.of('Parent'), rootRef);
  item.set(PDFName.of('A'), context.register(action));
  const itemRef = context.register(item);

  const root = PDFDict.withContext(context);
  root.set(PDFName.of('Type'), PDFName.of('Outlines'));
  root.set(PDFName.of('First'), itemRef);
  root.set(PDFName.of('Last'), itemRef);
  root.set(PDFName.of('Count'), PDFNumber.of(1));
  context.assign(rootRef, root);
  document.catalog.set(PDFName.of('Outlines'), rootRef);
  return document.save();
}

export interface WidgetSpec {
  page: number;
  rect: [number, number, number, number];
  /** Text painted by the appearance stream — what flattening must transfer. */
  ink: string;
  /** The annotation's own /Contents note, which flattening must delete. */
  note: string;
  /** Defaults to the rectangle's own size; set it to test the fitting matrix. */
  bbox?: [number, number, number, number];
  /** /F bit 2: the reader is told not to show it, so flatten must not paint it. */
  hidden?: boolean;
  /** Skips the appearance stream entirely, like a bare link rectangle. */
  withoutAppearance?: boolean;
}

/**
 * A signature-style /Widget annotation with a real appearance stream, plus the
 * AcroForm entry a reader would use to rebuild it. This is the shape flatten
 * has to defeat.
 */
export async function withWidgetAnnotation(
  bytes: Uint8Array,
  widget: WidgetSpec
): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = document.context;
  const font = await document.embedFont(StandardFonts.Helvetica);
  const [x1, y1, x2, y2] = widget.rect;

  const resources = context.obj({ Font: context.obj({ Helv: font.ref }) });
  const appearance = context.formXObject(
    [
      beginText(),
      setFontAndSize('Helv', 12),
      moveText(2, 4),
      showText(font.encodeText(widget.ink)),
      endText(),
    ],
    {
      BBox: context.obj(widget.bbox ?? [0, 0, x2 - x1, y2 - y1]),
      Resources: resources,
    }
  );

  const annotation = PDFDict.withContext(context);
  annotation.set(PDFName.of('Type'), PDFName.of('Annot'));
  annotation.set(PDFName.of('Subtype'), PDFName.of('Widget'));
  annotation.set(PDFName.of('FT'), PDFName.of('Sig'));
  annotation.set(PDFName.of('T'), PDFHexString.fromText('Signature1'));
  annotation.set(PDFName.of('Contents'), PDFHexString.fromText(widget.note));
  annotation.set(PDFName.of('Rect'), context.obj([x1, y1, x2, y2]));
  if (widget.hidden === true) annotation.set(PDFName.of('F'), PDFNumber.of(2));
  if (widget.withoutAppearance !== true) {
    const appearances = PDFDict.withContext(context);
    appearances.set(PDFName.of('N'), context.register(appearance));
    annotation.set(PDFName.of('AP'), appearances);
  }
  const annotationRef = context.register(annotation);

  const page = document.getPage(widget.page - 1);
  const annots = page.node.Annots() ?? PDFArray.withContext(context);
  annots.push(annotationRef);
  page.node.set(PDFName.of('Annots'), annots);

  const fields = PDFArray.withContext(context);
  fields.push(annotationRef);
  const form = PDFDict.withContext(context);
  form.set(PDFName.of('Fields'), fields);
  form.set(PDFName.of('NeedAppearances'), PDFBool.True);
  document.catalog.set(PDFName.of('AcroForm'), context.register(form));
  return document.save();
}

function inflateEveryStream(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const raw = buffer.toString('latin1');
  let text = raw;
  let cursor = 0;
  while (cursor < raw.length) {
    const start = raw.indexOf('stream', cursor);
    if (start === -1) break;
    let from = start + 'stream'.length;
    if (raw[from] === '\r') from += 1;
    if (raw[from] === '\n') from += 1;
    const end = raw.indexOf('endstream', from);
    if (end === -1) break;
    try {
      text += `\n${inflateSync(buffer.subarray(from, end)).toString('latin1')}`;
    } catch {
      // Not a flate stream (or a corrupt one) — the raw copy already covers it.
    }
    cursor = end + 'endstream'.length;
  }
  return text;
}

/** pdf-lib writes text strings as UTF-16BE hex behind a byte-order mark. */
const BYTE_ORDER_MARK = '\uFEFF';

/** Every way a marker can be stored: literal, WinAnsi hex, UTF-16BE hex. */
function encodingsOf(needle: string): string[] {
  const latin1 = Buffer.from(needle, 'latin1').toString('hex');
  const utf16 = Buffer.from(`${BYTE_ORDER_MARK}${needle}`, 'utf16le').swap16().toString('hex');
  return [needle.toLowerCase(), latin1, utf16];
}

/** True when `needle` is still readable anywhere in the file, however encoded. */
export function containsText(bytes: Uint8Array, needle: string): boolean {
  const haystack = inflateEveryStream(bytes).toLowerCase();
  return encodingsOf(needle).some((encoded) => haystack.includes(encoded));
}

/** Page widths of a saved document — the fixture's page-identity fingerprint. */
export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return document.getPages().map((page) => Math.round(page.getSize().width));
}

/** Page rotations of a saved document, in degrees. */
export async function pageRotations(bytes: Uint8Array): Promise<number[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return document.getPages().map((page) => page.getRotation().angle);
}

/** How many annotation objects survive, page by page. */
export async function annotationCounts(bytes: Uint8Array): Promise<number[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return document.getPages().map((page) => page.node.Annots()?.size() ?? 0);
}

/** Names in a page's /Resources /XObject — proof that flattened ink is drawn. */
export async function pageXObjectNames(bytes: Uint8Array, page: number): Promise<string[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const resources = document.getPage(page - 1).node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  return (xObjects?.keys() ?? []).map((key) => key.decodeText());
}

/** Whether an interactive form survives — it must not, once everything is flat. */
export async function hasAcroForm(bytes: Uint8Array): Promise<boolean> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return document.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict) !== undefined;
}

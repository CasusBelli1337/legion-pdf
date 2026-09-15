/**
 * TEST SUPPORT ONLY — never imported by shipping code.
 *
 * Fixtures for content-stream editing: pages whose text sits at coordinates the
 * test chose, pages that split their drawing across two content streams, and
 * pages that hide their text inside a form XObject. Those three shapes are the
 * ones a real production throws at a whiteout, and none of them can be built
 * with `page.drawText` alone.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  StandardFonts,
  beginText,
  degrees,
  drawObject,
  endText,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  translate,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PDFFont, PDFPage } from 'pdf-lib';

export interface TextLine {
  text: string;
  x: number;
  y: number;
  size?: number;
  /** `Tr`: 3 makes the line invisible, the way an OCR layer is. */
  renderMode?: number;
  /** Text direction in degrees counter-clockwise, set through `Tm`. */
  angle?: number;
}

export interface TextPageSpec {
  lines: TextLine[];
  width?: number;
  height?: number;
  rotation?: number;
  /** Split the lines across two `/Contents` streams, the way many writers do. */
  splitStreams?: boolean;
}

function placement(line: TextLine) {
  if (line.angle === undefined) return [moveText(line.x, line.y)];
  const radians = (line.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [setTextMatrix(cos, sin, -sin, cos, line.x, line.y)];
}

function lineOperators(font: PDFFont, line: TextLine) {
  return [
    beginText(),
    setFontAndSize('F1', line.size ?? 12),
    ...(line.renderMode === undefined ? [] : [setTextRenderingMode(line.renderMode)]),
    ...placement(line),
    showText(font.encodeText(line.text)),
    endText(),
  ];
}

function registerFont(page: PDFPage, font: PDFFont): void {
  const context = page.doc.context;
  const resources = page.node.Resources() ?? PDFDict.withContext(context);
  const fonts = resources.lookupMaybe(PDFName.Font, PDFDict) ?? PDFDict.withContext(context);
  fonts.set(PDFName.of('F1'), font.ref);
  resources.set(PDFName.Font, fonts);
  page.node.set(PDFName.Resources, resources);
}

function contentsOf(page: PDFPage, chunks: string[]): void {
  const context = page.doc.context;
  const refs = chunks.map((chunk) => context.register(context.stream(chunk)));
  if (refs.length === 1 && refs[0] !== undefined) {
    page.node.set(PDFName.Contents, refs[0]);
    return;
  }
  const array = PDFArray.withContext(context);
  for (const ref of refs) array.push(ref);
  page.node.set(PDFName.Contents, array);
}

function textFor(font: PDFFont, lines: readonly TextLine[]): string {
  return lines
    .flatMap((line) => lineOperators(font, line))
    .map((operator) => operator.toString())
    .join('\n');
}

/**
 * A page whose text is set in an EMBEDDED TrueType face — subset by default,
 * the way Word writes PDFs (Type0, Identity-H, a ToUnicode map, and a `loca`
 * table that only carries the glyphs the text used).
 */
export async function makeTrueTypePdf(
  spec: TextPageSpec,
  program: Uint8Array,
  subset = true
): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.registerFontkit(fontkit);
  const font = await document.embedFont(program, { subset });
  return buildPage(document, font, spec);
}

/** A page whose text sits exactly where the test put it, in Helvetica. */
export async function makeTextPdf(spec: TextPageSpec): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  return buildPage(document, font, spec);
}

async function buildPage(
  document: PDFDocument,
  font: PDFFont,
  spec: TextPageSpec
): Promise<Uint8Array> {
  const page = document.addPage([spec.width ?? 400, spec.height ?? 400]);
  if (spec.rotation !== undefined) page.setRotation(degrees(spec.rotation));
  registerFont(page, font);
  const half = Math.ceil(spec.lines.length / 2);
  const chunks =
    spec.splitStreams === true
      ? [textFor(font, spec.lines.slice(0, half)), textFor(font, spec.lines.slice(half))]
      : [textFor(font, spec.lines)];
  contentsOf(page, chunks);
  return document.save();
}

/**
 * A page that draws its text through a form XObject — the shape this lane
 * refuses to rewrite, and so the shape it must refuse LOUDLY.
 */
export async function makeFormTextPdf(
  line: TextLine,
  at: { x: number; y: number }
): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([400, 400]);
  const context = document.context;
  const form = context.formXObject(lineOperators(font, { ...line, x: 0, y: 0 }), {
    BBox: context.obj([0, 0, 300, 40]),
    Resources: context.obj({ Font: context.obj({ F1: font.ref }) }),
  });
  const formRef = context.register(form);
  const resources = PDFDict.withContext(context);
  const xobjects = PDFDict.withContext(context);
  xobjects.set(PDFName.of('Fx'), formRef);
  resources.set(PDFName.XObject, xobjects);
  page.node.set(PDFName.Resources, resources);
  const operators = [
    pushGraphicsState(),
    translate(at.x, at.y),
    drawObject('Fx'),
    popGraphicsState(),
  ];
  contentsOf(page, [operators.map((operator) => operator.toString()).join('\n')]);
  return document.save();
}

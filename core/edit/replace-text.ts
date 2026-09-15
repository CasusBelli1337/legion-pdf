/**
 * Rewriting a paragraph the page already carries — the write half of text
 * editing, and the deferred stretch goal of the whole product.
 *
 * The paragraph the attorney opened is found again (and must still read the
 * same), its glyphs are deleted from the page's own operators, and the new
 * text is laid out in the paragraph's frame — same left edge, same measure,
 * same leading, same alignment, same colour — and drawn back. In the
 * document's own font whenever that font can spell the new text; otherwise in
 * the closest built-in face, and the detail says so by naming the characters
 * that forced the change. Never a silent font swap.
 *
 * The result is proved on the SAVED bytes: the page is re-read and the
 * paragraph must now say exactly what was typed, and the shown-character count
 * must have moved by exactly the glyphs removed and added.
 */

import { degrees, rgb } from 'pdf-lib';
import type { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';
import type { OpResult, ReplaceTextDetail, ReplaceTextOptions } from '@shared/types';
import { builtInChoiceFor } from '@shared/font-family-rules';
import { countShownCharacters } from '@core/ocr';
import { standardFontFor } from '../fonts/standard-faces';
import { finish, loadPdf } from '../ops/pdf-io';
import { emitDocumentFontLines, type EmittedLines } from './emit-text';
import type { FontCodec } from './font-codec';
import {
  decoderFor,
  findBlock,
  readPageText,
  type FoundBlock,
  type PageText,
} from './inspect-text';
import { applyStreamEdits } from './remove-text-in-rect';
import { editRemoving, type ShowEdit } from './rewrite-shows';
import { fromFrame, groupLines, toFrame, type TextLine } from './text-lines';
import { layoutParagraph, type LaidLine, type LayoutSpec, type Measure } from './text-layout';

/** The edit did not do what it claimed. Raised instead of returning. */
export class EditNotProvedError extends Error {
  override name = 'EditNotProvedError';
}

const MAX_CHARACTERS = 8000;

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A point just inside the first glyph of a block's first line. */
function probePointOf(options: ReplaceTextOptions): { x: number; y: number } {
  const first = options.block.lines[0];
  const size = options.block.font.sizePt || 12;
  const angle = (options.block.angle * Math.PI) / 180;
  if (first === undefined) return { x: options.block.rect.x, y: options.block.rect.y };
  const at = toFrame(first.origin, angle);
  return fromFrame({ along: at.along + size * 0.3, across: at.across + size * 0.3 }, angle);
}

function findAgain(pageText: PageText, options: ReplaceTextOptions): FoundBlock {
  const found = findBlock(pageText, probePointOf(options));
  if (found === null || normalize(found.block.text) !== normalize(options.block.text)) {
    throw new Error(
      'The page has changed since you opened this text, so the edit was not applied. ' +
        'Click the paragraph again to reopen it.'
    );
  }
  return found;
}

/** The column's right edge: the widest line that shares this paragraph's column. */
function rightEdgeOf(found: FoundBlock): number {
  const [first] = found.lines;
  if (first === undefined) return 0;
  const shares = (line: TextLine): boolean =>
    Math.min(line.end, first.end) - Math.max(line.start, first.start) > 0;
  return Math.max(...found.pageLines.filter(shares).map((line) => line.end));
}

function specOf(found: FoundBlock): LayoutSpec {
  const { lines, block } = found;
  const body = lines.length > 1 ? lines.slice(1) : lines;
  const left = Math.min(...body.map((line) => line.start));
  const first = lines[0]?.start ?? left;
  return {
    left,
    right: Math.max(rightEdgeOf(found), ...lines.map((line) => line.end)),
    firstIndent: lines.length > 1 ? first - left : 0,
    alignment: block.alignment,
    leading: block.leadingPt,
  };
}

interface Plan {
  found: FoundBlock;
  laid: LaidLine[];
  mode: ReplaceTextDetail['fontMode'];
  missing: string[];
  builtIn: PDFFont | null;
  choice: ReturnType<typeof builtInChoiceFor> | null;
}

function documentMeasure(pageText: PageText, found: FoundBlock, codec: FontCodec): Measure {
  const metrics = pageText.resources.fonts.get(found.fontName);
  const size = found.block.font.sizePt;
  return (text) =>
    codec
      .encode(text)
      .codes.reduce((total, code) => total + ((metrics?.widthOf(code) ?? 500) / 1000) * size, 0);
}

async function planBuiltIn(
  document: PDFDocument,
  found: FoundBlock,
  options: ReplaceTextOptions,
  spec: LayoutSpec,
  missing: string[]
): Promise<Plan> {
  const codec = found.codec;
  const choice = builtInChoiceFor(codec?.baseFont ?? '', codec?.family ?? 'serif');
  const builtIn = await document.embedFont(standardFontFor(choice) as StandardFonts);
  assertBuiltInCanPrint(builtIn, options.text);
  const size = found.block.font.sizePt;
  const laid = layoutParagraph(options.text, spec, (text) => builtIn.widthOfTextAtSize(text, size));
  return { found, laid, mode: 'built-in-font', missing, builtIn, choice };
}

async function planEdit(
  document: PDFDocument,
  pageText: PageText,
  options: ReplaceTextOptions
): Promise<Plan> {
  const found = findAgain(pageText, options);
  const codec = found.codec;
  const spec = specOf(found);
  const encoded = codec?.reusable === true ? codec.encode(options.text) : null;
  if (codec === undefined || encoded === null || encoded.missing.length > 0) {
    return planBuiltIn(document, found, options, spec, encoded?.missing ?? []);
  }
  const laid = layoutParagraph(options.text, spec, documentMeasure(pageText, found, codec));
  return { found, laid, mode: 'document-font', missing: [], builtIn: null, choice: null };
}

/** A character no face can show is refused by name, never dropped from the page. */
function assertBuiltInCanPrint(font: PDFFont, text: string): void {
  for (const character of text) {
    try {
      font.encodeText(character);
    } catch {
      throw new RangeError(
        `"${character}" cannot be typed into this document: neither its own font nor the ` +
          'built-in fonts can show it. Remove that character and try again.'
      );
    }
  }
}

function removeOld(
  pageText: PageText,
  found: FoundBlock
): { edits: ShowEdit[]; glyphs: number; bytes: number } {
  const doomed = new Set<string>();
  for (const line of found.lines) {
    for (const glyph of line.glyphs) doomed.add(`${glyph.show}:${glyph.item}:${glyph.index}`);
  }
  const edits: ShowEdit[] = [];
  pageText.scan.shows.forEach((show, index) => {
    const edit = editRemoving(show, (_glyph, item, glyph) =>
      doomed.has(`${index}:${item}:${glyph}`)
    );
    if (edit !== null) edits.push(edit);
  });
  applyStreamEdits(pageText.page, pageText.pageNumber, pageText.joined, edits);
  return {
    edits,
    glyphs: edits.reduce((total, edit) => total + edit.glyphsRemoved, 0),
    bytes: edits.reduce((total, edit) => total + edit.bytesRemoved, 0),
  };
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

/** Draws the laid-out lines in a built-in face through pdf-lib's own brush. */
function emitBuiltIn(page: PDFPage, plan: Plan, font: PDFFont): EmittedLines {
  const { block } = plan.found;
  const angle = plan.found.angle;
  const size = block.font.sizePt;
  const first = plan.found.lines[0]?.baseline ?? 0;
  const color = hexToRgb(block.font.colorHex);
  let glyphs = 0;
  for (const line of plan.laid) {
    const across = first - line.row * block.leadingPt;
    let along = line.start;
    line.words.forEach((word, index) => {
      const at = fromFrame({ along, across }, angle);
      page.drawText(word.text, {
        x: at.x,
        y: at.y,
        size,
        font,
        color,
        rotate: degrees(block.angle),
      });
      glyphs += word.text.length;
      along +=
        word.width +
        line.extraPerGap +
        (index < line.words.length - 1 ? font.widthOfTextAtSize(' ', size) : 0);
    });
  }
  return { glyphs, bytes: glyphs };
}

function emitNew(pageText: PageText, plan: Plan): EmittedLines {
  if (plan.mode === 'built-in-font' && plan.builtIn !== null) {
    return emitBuiltIn(pageText.page, plan, plan.builtIn);
  }
  const codec = plan.found.codec;
  if (codec === undefined) throw new Error("The paragraph's font could not be read back.");
  return emitDocumentFontLines(pageText.page, plan.found, plan.laid, codec);
}

function detailOf(plan: Plan, removed: number, added: number, notes: string[]): ReplaceTextDetail {
  const detail: ReplaceTextDetail = {
    fontMode: plan.mode,
    missingCharacters: plan.missing,
    linesBefore: plan.found.lines.length,
    linesAfter: plan.laid.length,
    overflowed: plan.laid.length > plan.found.lines.length,
    glyphsRemoved: removed,
    glyphsAdded: added,
    notes,
  };
  if (plan.choice !== null) detail.builtInFont = plan.choice;
  return detail;
}

function notesFor(plan: Plan): string[] {
  const notes: string[] = [];
  const fonts = new Set(
    plan.found.lines.flatMap((line) => line.glyphs.map((glyph) => glyph.fontName))
  );
  if (fonts.size > 1) notes.push('This paragraph mixed more than one font; it is now set in one.');
  if (plan.laid.length > plan.found.lines.length) {
    const extra = plan.laid.length - plan.found.lines.length;
    notes.push(
      `The new text runs ${extra} ${extra === 1 ? 'line' : 'lines'} longer than before and may overlap what follows.`
    );
  }
  return notes;
}

/** The text now standing in the band the new lines were drawn in, top to bottom. */
function textInBand(pageText: PageText, plan: Plan): string {
  const { angle, lines } = plan.found;
  const size = plan.found.block.font.sizePt;
  const first = lines[0]?.baseline ?? 0;
  const rows = Math.max(1, plan.laid.length);
  const top = first + size * 0.5;
  const bottom = first - (rows - 1) * plan.found.block.leadingPt - size * 0.5;
  const left = Math.min(...plan.laid.map((line) => line.start)) - EDGE_SLACK;
  const right =
    Math.max(
      ...plan.laid.map((line) => line.start),
      plan.found.block.rect.x + plan.found.block.rect.width
    ) + EDGE_SLACK;
  const decode = decoderFor(pageText.codecs);
  return groupLines(pageText.glyphs, angle, decode)
    .filter((line) => line.baseline <= top && line.baseline >= bottom)
    .filter((line) => line.start >= left && line.start <= right + EDGE_SLACK)
    .map((line) => line.text)
    .join(' ');
}

const EDGE_SLACK = 2;

/** After saving: the paragraph must read as typed, and the counts must add up. */
async function prove(
  bytes: Uint8Array,
  options: ReplaceTextOptions,
  plan: Plan,
  shownBefore: number,
  removed: number,
  added: number
): Promise<void> {
  const reloaded = await loadPdf(bytes, 'edited document');
  const pageText = await readPageText(reloaded, options.page);
  const shownAfter = countShownCharacters(pageText.joined.bytes);
  if (shownAfter - shownBefore !== added - removed) {
    throw new EditNotProvedError(
      `Page ${options.page} showed ${shownBefore} characters and now shows ${shownAfter}, where a change of ` +
        `${added - removed} was expected — the edit is not trusted and was not kept.`
    );
  }
  const expected = normalize(options.text);
  if (expected === '') return;
  const found = normalize(textInBand(pageText, plan));
  if (found !== expected) {
    throw new EditNotProvedError(
      `Page ${options.page} does not read back the edited text after the rewrite — the edit was not kept.`
    );
  }
}

function assertOptions(options: ReplaceTextOptions, pageCount: number): void {
  if (!Number.isInteger(options.page) || options.page < 1 || options.page > pageCount) {
    throw new RangeError(
      `This document has pages 1 through ${pageCount}; there is no page ${options.page}.`
    );
  }
  if (options.text.length > MAX_CHARACTERS) {
    throw new RangeError(`An edited paragraph holds at most ${MAX_CHARACTERS} characters.`);
  }
}

/**
 * Replaces one paragraph. With `dryRun` the bytes come back untouched and the
 * detail reports the plan — which font, which characters are missing, whether
 * the new text runs long — so the editor can say so before the attorney commits.
 */
export async function replaceText(
  bytes: Uint8Array,
  options: ReplaceTextOptions
): Promise<OpResult<ReplaceTextDetail>> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  assertOptions(options, pagesIn);
  const pageText = await readPageText(document, options.page);
  const plan = await planEdit(document, pageText, options);
  const notes = notesFor(plan);
  if (options.dryRun === true) {
    return { bytes, pagesIn, pagesOut: pagesIn, detail: detailOf(plan, 0, 0, notes) };
  }
  const shownBefore = countShownCharacters(pageText.joined.bytes);
  const removed = removeOld(pageText, plan.found);
  const added = normalize(options.text) === '' ? { glyphs: 0, bytes: 0 } : emitNew(pageText, plan);
  const result = await finish(
    document,
    pagesIn,
    pagesIn,
    detailOf(plan, removed.glyphs, added.glyphs, notes),
    'edited document'
  );
  await prove(result.bytes, options, plan, shownBefore, removed.bytes, added.bytes);
  return result;
}

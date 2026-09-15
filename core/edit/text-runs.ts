/**
 * Where every glyph on a page actually lands.
 *
 * This is the graphics/text state machine a PDF reader runs, kept to the part
 * an editor needs: the current transform, the text and line matrices, the face
 * and size in force, and the spacing that moves the pen between glyphs. Feeding
 * that with the font's widths turns `Tj`/`TJ`/`'`/`"` into a list of glyph
 * boxes in PDF user space — which is the only honest way to ask "is this
 * character underneath the box the attorney drew?" or "which paragraph did the
 * attorney click?".
 *
 * Text render mode is recorded, not filtered: whiteout removal must see mode 3
 * (invisible OCR text — the text most likely to leak), and text editing must
 * refuse it (the words on a scan are pixels). Each caller decides.
 */

import type { PdfPoint, PdfRect } from '@shared/types';
import { tokenize, type StreamToken } from './content-lexer';
import type { GlyphMetrics } from './font-widths';
import { IDENTITY, apply, boundsOf, multiply, translation, type Matrix } from './matrix';
import { STATE_HANDLERS, initialState, lineFeed, numbersOf, type TextState } from './text-state';

export interface ShownGlyph {
  code: number;
  /** Upright box around the glyph, in PDF user space. */
  box: PdfRect;
  /** Where the pen was when this glyph was drawn — its baseline start, user space. */
  origin: PdfPoint;
  /** Advance the pen takes for this glyph, before the horizontal scale. */
  advance: number;
}

export type ShowItem = { kind: 'glyphs'; glyphs: ShownGlyph[] } | { kind: 'adjust'; value: number };

export interface ShowOperation {
  /** Byte offset of the first operand of this show. */
  start: number;
  /** Byte offset one past its operator. */
  end: number;
  /** Operators to re-emit ahead of a rewrite: the line move and spacing of `'`/`"`. */
  prefix: string;
  /** Text size in force, which turns a removed advance back into a `TJ` number. */
  size: number;
  /** Bytes per character code in the face in force, so a rewrite can re-encode. */
  codeBytes: 1 | 2;
  /** The `/Fn` resource name the glyphs were set in. */
  fontName: string;
  /** Fill colour in force, "#rrggbb". */
  fillColor: string;
  /** `Tr` in force; 3 is invisible text. */
  renderMode: number;
  /** Text-space-to-user-space at the start of the show (size not included). */
  matrix: Matrix;
  items: ShowItem[];
}

/** A form XObject already decoded, with its own placement and resources. */
export interface FormContent {
  content: Uint8Array;
  matrix: Matrix;
  resources: ScanResources;
}

export interface ScanResources {
  fonts: Map<string, GlyphMetrics>;
  forms: Map<string, FormContent>;
}

export interface ScanResult {
  shows: ShowOperation[];
  /** Glyphs drawn inside a form XObject — visible here, never rewritten here. */
  nested: ShownGlyph[];
  /** True when any face on the page fell back to nominal widths. */
  approximate: boolean;
}

/** Character codes a string token carries, one or two bytes each. */
function codesOf(bytes: readonly number[], codeBytes: 1 | 2): number[] {
  if (codeBytes === 1) return [...bytes];
  const codes: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    codes.push(((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0));
  }
  return codes;
}

/** Text space → user space with the size, scale, and rise applied. */
function renderMatrix(state: TextState): Matrix {
  return multiply(
    [state.size * state.horizontal, 0, 0, state.size, 0, state.rise],
    multiply(state.text, state.ctm)
  );
}

function glyphBox(render: Matrix, font: GlyphMetrics, width: number): PdfRect {
  const top = font.ascent / 1000;
  const bottom = font.descent / 1000;
  const corners: PdfPoint[] = [
    { x: 0, y: bottom },
    { x: width, y: bottom },
    { x: width, y: top },
    { x: 0, y: top },
  ];
  return boundsOf(corners.map((corner) => apply(render, corner)));
}

/** Advances the pen over one string and reports the glyphs it drew. */
function showGlyphs(state: TextState, bytes: readonly number[]): ShownGlyph[] {
  const font = state.font;
  if (font === null) return [];
  const glyphs: ShownGlyph[] = [];
  for (const code of codesOf(bytes, font.codeBytes)) {
    const width = font.widthOf(code) / 1000;
    const spacing = code === 32 && font.codeBytes === 1 ? state.wordSpacing : 0;
    const advance = width * state.size + state.charSpacing + spacing;
    const render = renderMatrix(state);
    glyphs.push({
      code,
      box: glyphBox(render, font, width),
      origin: apply(render, { x: 0, y: 0 }),
      advance,
    });
    state.text = multiply(translation(advance * state.horizontal, 0), state.text);
  }
  return glyphs;
}

function adjust(state: TextState, value: number): void {
  const shift = (-value / 1000) * state.size * state.horizontal;
  state.text = multiply(translation(shift, 0), state.text);
}

function itemsOf(state: TextState, operands: readonly StreamToken[]): ShowItem[] {
  const items: ShowItem[] = [];
  for (const token of operands) {
    if (token.kind === 'string')
      items.push({ kind: 'glyphs', glyphs: showGlyphs(state, token.bytes) });
    else if (token.kind === 'number') {
      items.push({ kind: 'adjust', value: Number(token.text) });
      adjust(state, Number(token.text));
    }
  }
  return items;
}

interface Walk {
  state: TextState;
  resources: ScanResources;
  out: ScanResult;
  depth: number;
}

/**
 * The operands that carry glyphs. `TJ` shows a whole array of strings and
 * kerning numbers; the other three show one string, and any numbers beside it
 * (`"` takes two spacings) are settings, not adjustments.
 */
function shownOperands(operator: string, operands: readonly StreamToken[]): StreamToken[] {
  if (operator === 'TJ') {
    return operands.filter((token) => token.kind === 'string' || token.kind === 'number');
  }
  return operands.filter((token) => token.kind === 'string').slice(-1);
}

function record(
  walk: Walk,
  operands: readonly StreamToken[],
  operator: StreamToken,
  prefix: string
): void {
  const { state } = walk;
  walk.out.shows.push({
    start: operands[0]?.start ?? operator.start,
    end: operator.end,
    prefix,
    size: state.size,
    codeBytes: state.font?.codeBytes ?? 1,
    fontName: state.fontName,
    fillColor: state.fillColor,
    renderMode: state.renderMode,
    matrix: multiply(state.text, state.ctm),
    items: itemsOf(state, shownOperands(operator.text, operands)),
  });
}

type ShowHandler = (walk: Walk, operands: StreamToken[], operator: StreamToken) => void;

const SHOW_HANDLERS: Record<string, ShowHandler> = {
  Tj: (walk, operands, operator) => record(walk, operands, operator, ''),
  TJ: (walk, operands, operator) => record(walk, operands, operator, ''),
  "'": (walk, operands, operator) => {
    lineFeed(walk.state);
    record(walk, operands, operator, 'T*');
  },
  '"': (walk, operands, operator) => {
    const [wordSpacing = 0, charSpacing = 0] = numbersOf(operands).slice(0, 2);
    walk.state.wordSpacing = wordSpacing;
    walk.state.charSpacing = charSpacing;
    lineFeed(walk.state);
    record(walk, operands, operator, `${wordSpacing} Tw ${charSpacing} Tc T*`);
  },
  Do: (walk, operands) => enterForm(walk, operands),
};

function enterForm(walk: Walk, operands: readonly StreamToken[]): void {
  const name = operands.filter((token) => token.kind === 'name').at(-1)?.text ?? '';
  const form = walk.resources.forms.get(name);
  if (form === undefined || walk.depth >= MAX_FORM_DEPTH) return;
  const inner = scanText(
    form.content,
    form.resources,
    multiply(form.matrix, walk.state.ctm),
    walk.depth + 1
  );
  for (const show of inner.shows) {
    for (const item of show.items) {
      if (item.kind === 'glyphs') walk.out.nested.push(...item.glyphs);
    }
  }
  walk.out.nested.push(...inner.nested);
  if (inner.approximate) walk.out.approximate = true;
}

/** Forms nest; a file that nests them this deep is malformed, not clever. */
const MAX_FORM_DEPTH = 8;

function step(walk: Walk, operands: StreamToken[], operator: StreamToken): void {
  const setState = STATE_HANDLERS[operator.text];
  if (setState !== undefined) {
    setState(walk.state, operands, walk.resources.fonts);
    if (operator.text === 'Tf' && walk.state.font?.approximate === true) {
      walk.out.approximate = true;
    }
    return;
  }
  SHOW_HANDLERS[operator.text]?.(walk, operands, operator);
}

/**
 * Every text-showing operation in one stream, with its glyphs placed in user
 * space. `ctm` is the transform in force where the stream begins — identity for
 * a page, the form's own matrix for a form XObject.
 */
export function scanText(
  content: Uint8Array,
  resources: ScanResources,
  ctm: Matrix = IDENTITY,
  depth = 0
): ScanResult {
  const walk: Walk = {
    state: initialState(ctm),
    resources,
    out: { shows: [], nested: [], approximate: false },
    depth,
  };
  let operands: StreamToken[] = [];
  for (const token of tokenize(content)) {
    if (token.kind !== 'operator') {
      operands.push(token);
      continue;
    }
    step(walk, operands, token);
    operands = [];
  }
  return walk.out;
}

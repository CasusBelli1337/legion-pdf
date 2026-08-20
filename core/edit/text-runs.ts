/**
 * Where every glyph on a page actually lands.
 *
 * This is the graphics/text state machine a PDF reader runs, kept to the part
 * an editor needs: the current transform, the text and line matrices, the face
 * and size in force, and the spacing that moves the pen between glyphs. Feeding
 * that with the font's widths turns `Tj`/`TJ`/`'`/`"` into a list of glyph
 * boxes in PDF user space — which is the only honest way to ask "is this
 * character underneath the box the attorney drew?".
 *
 * Text render mode is deliberately ignored: mode 3 is INVISIBLE text, which is
 * exactly what an OCR layer is made of, and invisible text is the text most
 * likely to leak out of a covered area into a copy/paste or an AI prompt.
 */

import type { PdfPoint, PdfRect } from '@shared/types';
import { tokenize, type StreamToken } from './content-lexer';
import type { GlyphMetrics } from './font-widths';
import {
  IDENTITY,
  apply,
  boundsOf,
  matrixFrom,
  multiply,
  translation,
  type Matrix,
} from './matrix';

export interface ShownGlyph {
  code: number;
  /** Upright box around the glyph, in PDF user space. */
  box: PdfRect;
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

interface State {
  ctm: Matrix;
  stack: Matrix[];
  text: Matrix;
  line: Matrix;
  font: GlyphMetrics | null;
  size: number;
  charSpacing: number;
  wordSpacing: number;
  horizontal: number;
  leading: number;
  rise: number;
}

function initialState(ctm: Matrix): State {
  return {
    ctm,
    stack: [],
    text: IDENTITY,
    line: IDENTITY,
    font: null,
    size: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontal: 1,
    leading: 0,
    rise: 0,
  };
}

function numbersOf(operands: readonly StreamToken[]): number[] {
  return operands.filter((token) => token.kind === 'number').map((token) => Number(token.text));
}

function last(values: readonly number[], fallback = 0): number {
  return values.at(-1) ?? fallback;
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

function glyphBox(state: State, font: GlyphMetrics, width: number): PdfRect {
  const render = multiply(
    [state.size * state.horizontal, 0, 0, state.size, 0, state.rise],
    multiply(state.text, state.ctm)
  );
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
function showGlyphs(state: State, bytes: readonly number[]): ShownGlyph[] {
  const font = state.font;
  if (font === null) return [];
  const glyphs: ShownGlyph[] = [];
  for (const code of codesOf(bytes, font.codeBytes)) {
    const width = font.widthOf(code) / 1000;
    const spacing = code === 32 && font.codeBytes === 1 ? state.wordSpacing : 0;
    const advance = width * state.size + state.charSpacing + spacing;
    glyphs.push({ code, box: glyphBox(state, font, width), advance });
    state.text = multiply(translation(advance * state.horizontal, 0), state.text);
  }
  return glyphs;
}

function adjust(state: State, value: number): void {
  const shift = (-value / 1000) * state.size * state.horizontal;
  state.text = multiply(translation(shift, 0), state.text);
}

function nextLine(state: State, tx: number, ty: number): void {
  state.line = multiply(translation(tx, ty), state.line);
  state.text = state.line;
}

function itemsOf(state: State, operands: readonly StreamToken[]): ShowItem[] {
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
  state: State;
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
  walk.out.shows.push({
    start: operands[0]?.start ?? operator.start,
    end: operator.end,
    prefix,
    size: walk.state.size,
    codeBytes: walk.state.font?.codeBytes ?? 1,
    items: itemsOf(walk.state, shownOperands(operator.text, operands)),
  });
}

type Handler = (walk: Walk, operands: StreamToken[], operator: StreamToken) => void;

const HANDLERS: Record<string, Handler> = {
  q: ({ state }) => {
    state.stack.push(state.ctm);
  },
  Q: ({ state }) => {
    state.ctm = state.stack.pop() ?? IDENTITY;
  },
  cm: ({ state }, operands) => {
    state.ctm = multiply(matrixFrom(numbersOf(operands)), state.ctm);
  },
  BT: ({ state }) => {
    state.text = IDENTITY;
    state.line = IDENTITY;
  },
  Tm: ({ state }, operands) => {
    state.line = matrixFrom(numbersOf(operands));
    state.text = state.line;
  },
  Tf: (walk, operands) => {
    const name = operands.filter((token) => token.kind === 'name').at(-1)?.text ?? '';
    walk.state.font = walk.resources.fonts.get(name) ?? null;
    walk.state.size = last(numbersOf(operands));
    if (walk.state.font?.approximate === true) walk.out.approximate = true;
  },
  Td: ({ state }, operands) => {
    const [tx = 0, ty = 0] = numbersOf(operands).slice(-2);
    nextLine(state, tx, ty);
  },
  TD: ({ state }, operands) => {
    const [tx = 0, ty = 0] = numbersOf(operands).slice(-2);
    state.leading = -ty;
    nextLine(state, tx, ty);
  },
  'T*': ({ state }) => nextLine(state, 0, -state.leading),
  TL: ({ state }, operands) => {
    state.leading = last(numbersOf(operands));
  },
  Tc: ({ state }, operands) => {
    state.charSpacing = last(numbersOf(operands));
  },
  Tw: ({ state }, operands) => {
    state.wordSpacing = last(numbersOf(operands));
  },
  Tz: ({ state }, operands) => {
    state.horizontal = last(numbersOf(operands), 100) / 100;
  },
  Ts: ({ state }, operands) => {
    state.rise = last(numbersOf(operands));
  },
  Tj: (walk, operands, operator) => record(walk, operands, operator, ''),
  TJ: (walk, operands, operator) => record(walk, operands, operator, ''),
  "'": (walk, operands, operator) => {
    nextLine(walk.state, 0, -walk.state.leading);
    record(walk, operands, operator, 'T*');
  },
  '"': (walk, operands, operator) => {
    const [wordSpacing = 0, charSpacing = 0] = numbersOf(operands).slice(0, 2);
    walk.state.wordSpacing = wordSpacing;
    walk.state.charSpacing = charSpacing;
    nextLine(walk.state, 0, -walk.state.leading);
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
    HANDLERS[token.text]?.(walk, operands, token);
    operands = [];
  }
  return walk.out;
}

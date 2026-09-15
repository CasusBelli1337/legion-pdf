/**
 * Reading a page's operator list for what the text content cannot say: the
 * colour each run was painted in, whether it was invisible (render mode 3 — an
 * OCR layer), where the pictures sit, and which thin filled shapes are rules
 * (underlines, table borders). Pure: hand it pdfjs' fnArray/argsArray and its
 * OPS table and it walks them; nothing here touches pdfjs itself.
 *
 * The transform stack is tracked the way the canvas does it, so an image drawn
 * inside a form XObject lands where the page shows it.
 */

import type { PdfRect } from '@shared/types';

export type Matrix = readonly [number, number, number, number, number, number];
export type OpsTable = Readonly<Record<string, number>>;

export interface OpList {
  fnArray: readonly number[];
  argsArray: readonly unknown[];
}

export interface TextOp {
  colorHex: string;
  hidden: boolean;
  /** Letters and digits shown — what the text items are matched against. */
  letters: number;
}

export interface ImageOp {
  /** pdfjs object id, or null for an inline image carried in `inline`. */
  objId: string | null;
  inline: unknown;
  ctm: Matrix;
}

export interface OpWalk {
  texts: TextOp[];
  images: ImageOp[];
  rules: PdfRect[];
}

interface State {
  ctm: Matrix;
  stack: Matrix[];
  fill: string;
  hidden: boolean;
  out: OpWalk;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** Text render modes 3 and 7 draw nothing: invisible text, i.e. an OCR layer. */
const INVISIBLE_MODES = new Set([3, 7]);
/** A filled shape thinner than this and longer than the other is a rule. */
const RULE_THICKNESS = 2.5;
const RULE_LENGTH = 4;

export function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

/** The upright box a matrix maps a box onto. */
export function transformedBox(matrix: Matrix, box: PdfRect): PdfRect {
  const [a, b, c, d, e, f] = matrix;
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x = 0, y = 0]) => ({ x: a * x + c * y + e, y: b * x + d * y + f }));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const bottom = Math.min(...ys);
  return { x: left, y: bottom, width: Math.max(...xs) - left, height: Math.max(...ys) - bottom };
}

const LETTER = /[\p{L}\p{N}]/gu;

/** Letters and digits in a string, NFKC-normalised so a ligature counts its letters. */
export function countLetters(text: string): number {
  return text.normalize('NFKC').match(LETTER)?.length ?? 0;
}

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every((n) => typeof n === 'number');
}

function numbersOf(value: unknown): number[] | null {
  if (!ArrayBuffer.isView(value) && !Array.isArray(value)) return null;
  const list = Array.from(value as ArrayLike<number>);
  return list.every((n) => typeof n === 'number') ? list : null;
}

function glyphLetters(glyphs: unknown): number {
  if (!Array.isArray(glyphs)) return 0;
  let letters = 0;
  for (const glyph of glyphs) {
    const unicode = (glyph as { unicode?: unknown } | null)?.unicode;
    if (typeof unicode === 'string') letters += countLetters(unicode);
  }
  return letters;
}

function isRule(rect: PdfRect): boolean {
  return (
    (rect.height <= RULE_THICKNESS && rect.width >= RULE_LENGTH) ||
    (rect.width <= RULE_THICKNESS && rect.height >= RULE_LENGTH)
  );
}

type Handler = (state: State, args: readonly unknown[]) => void;

function paintedOps(ops: OpsTable): Set<number> {
  return new Set(
    [
      'fill',
      'eoFill',
      'fillStroke',
      'eoFillStroke',
      'closeFillStroke',
      'closeEOFillStroke',
      'stroke',
      'closeStroke',
    ]
      .map((name) => ops[name])
      .filter((value): value is number => value !== undefined)
  );
}

function constructPath(state: State, args: readonly unknown[], painted: Set<number>): void {
  const [op, , minMax] = args;
  if (typeof op !== 'number' || !painted.has(op)) return;
  const bounds = numbersOf(minMax);
  if (bounds === null || bounds.length < 4) return;
  const [minX = 0, minY = 0, maxX = 0, maxY = 0] = bounds;
  const rect = transformedBox(state.ctm, {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
  if (isRule(rect)) state.out.rules.push(rect);
}

function repeatImage(state: State, args: readonly unknown[]): void {
  const [objId, scaleX, scaleY, positions] = args;
  const points = numbersOf(positions);
  if (typeof objId !== 'string' || typeof scaleX !== 'number' || typeof scaleY !== 'number') return;
  if (points === null) return;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const placement: Matrix = [scaleX, 0, 0, scaleY, points[index] ?? 0, points[index + 1] ?? 0];
    state.out.images.push({ objId, inline: null, ctm: multiply(placement, state.ctm) });
  }
}

function handlers(ops: OpsTable): Map<number, Handler> {
  const painted = paintedOps(ops);
  const table: Record<string, Handler> = {
    save: (state) => state.stack.push(state.ctm),
    restore: (state) => {
      state.ctm = state.stack.pop() ?? IDENTITY;
    },
    transform: (state, args) => {
      if (isMatrix(args)) state.ctm = multiply(args, state.ctm);
    },
    setFillRGBColor: (state, [color]) => {
      if (typeof color === 'string') state.fill = color;
    },
    setTextRenderingMode: (state, [mode]) => {
      state.hidden = typeof mode === 'number' && INVISIBLE_MODES.has(mode);
    },
    showText: (state, [glyphs]) => {
      state.out.texts.push({
        colorHex: state.fill,
        hidden: state.hidden,
        letters: glyphLetters(glyphs),
      });
    },
    paintImageXObject: (state, [objId]) => {
      if (typeof objId === 'string') {
        state.out.images.push({ objId, inline: null, ctm: state.ctm });
      }
    },
    paintInlineImageXObject: (state, [image]) => {
      state.out.images.push({ objId: null, inline: image, ctm: state.ctm });
    },
    paintImageXObjectRepeat: repeatImage,
    paintFormXObjectBegin: (state, [matrix]) => {
      state.stack.push(state.ctm);
      if (isMatrix(matrix)) state.ctm = multiply(matrix, state.ctm);
    },
    paintFormXObjectEnd: (state) => {
      state.ctm = state.stack.pop() ?? IDENTITY;
    },
    constructPath: (state, args) => constructPath(state, args, painted),
  };
  const byNumber = new Map<number, Handler>();
  for (const [name, handler] of Object.entries(table)) {
    const code = ops[name];
    if (code !== undefined) byNumber.set(code, handler);
  }
  return byNumber;
}

/** Everything the text content leaves out, read off the operator list in order. */
export function walkOperators(list: OpList, ops: OpsTable): OpWalk {
  const state: State = {
    ctm: IDENTITY,
    stack: [],
    fill: '#000000',
    hidden: false,
    out: { texts: [], images: [], rules: [] },
  };
  const table = handlers(ops);
  list.fnArray.forEach((fn, index) => {
    const args = list.argsArray[index];
    table.get(fn)?.(state, Array.isArray(args) ? args : []);
  });
  return state.out;
}

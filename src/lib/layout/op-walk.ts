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
import { PEN_OPS, newPen, showWithPen } from './text-pen';
import type { Pen } from './text-pen';
import { glyphShape } from './wide-spaces';
import type { GlyphShape } from './wide-spaces';

export { countLetters } from './wide-spaces';

export type Matrix = readonly [number, number, number, number, number, number];
export type OpsTable = Readonly<Record<string, number>>;

export interface OpList {
  fnArray: readonly number[];
  argsArray: readonly unknown[];
}

export interface TextOp extends GlyphShape {
  colorHex: string;
  hidden: boolean;
}

export interface ImageOp {
  /** pdfjs object id, or null for an inline image carried in `inline`. */
  objId: string | null;
  inline: unknown;
  ctm: Matrix;
}

/** A small stroked square — a form's checkbox — and whether strokes were drawn across it. */
export interface BoxOp {
  rect: PdfRect;
  checked: boolean;
}

export interface OpWalk {
  texts: TextOp[];
  images: ImageOp[];
  rules: PdfRect[];
  boxes: BoxOp[];
}

interface State {
  ctm: Matrix;
  stack: Matrix[];
  fill: string;
  hidden: boolean;
  /** Where the text pen is, for telling two spaces typed together from two set apart (wide-spaces.ts). */
  pen: Pen;
  out: OpWalk;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Text render modes 3 and 7 draw nothing: invisible text, i.e. an OCR layer. */
const INVISIBLE_MODES = new Set([3, 7]);
/** A filled shape thinner than this and longer than the other is a rule. */
const RULE_THICKNESS = 2.5;
const RULE_LENGTH = 4;
/** A stroked square between these sizes (points), square to this fraction, is a checkbox. */
const BOX_MIN = 6;
const BOX_MAX = 18;
const BOX_SQUARENESS = 0.15;
/** A stroke whose bounds sit within this of a box's is drawn in that box. */
const BOX_REACH = 1.5;

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

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every((n) => typeof n === 'number');
}

/** pdfjs hands a form's matrix over as a Float32Array, a `cm` as a plain array: both are six numbers. */
function matrixOf(value: unknown): Matrix | null {
  const list = numbersOf(value);
  return isMatrix(list) ? list : null;
}

function numbersOf(value: unknown): number[] | null {
  if (!ArrayBuffer.isView(value) && !Array.isArray(value)) return null;
  const list = Array.from(value as ArrayLike<number>);
  return list.every((n) => typeof n === 'number') ? list : null;
}

function isRule(rect: PdfRect): boolean {
  return (
    (rect.height <= RULE_THICKNESS && rect.width >= RULE_LENGTH) ||
    (rect.width <= RULE_THICKNESS && rect.height >= RULE_LENGTH)
  );
}

function isBox(rect: PdfRect): boolean {
  const long = Math.max(rect.width, rect.height);
  const short = Math.min(rect.width, rect.height);
  return short >= BOX_MIN && long <= BOX_MAX && long - short <= BOX_SQUARENESS * long;
}

function within(inner: PdfRect, outer: PdfRect): boolean {
  return (
    inner.x >= outer.x - BOX_REACH &&
    inner.y >= outer.y - BOX_REACH &&
    inner.x + inner.width <= outer.x + outer.width + BOX_REACH &&
    inner.y + inner.height <= outer.y + outer.height + BOX_REACH
  );
}

/** pdfjs' path data is a flat list: 0 x y moves, 1 x y draws a line, 4 closes; anything else is a curve. */
const MOVE_TO = 0;
const LINE_TO = 1;

/**
 * True for an open stroke of one or two straight lines — half of a box's X
 * (corner to corner), or a tick. The box itself is four corners and a close,
 * so outlining a box twice never checks it.
 */
function isMark(path: unknown): boolean {
  const data = Array.isArray(path) ? numbersOf(path[0]) : null;
  if (data === null) return false;
  let lines = 0;
  for (let index = 0; index < data.length; index += 3) {
    const code = data[index];
    if (code === LINE_TO) lines += 1;
    else if (code !== MOVE_TO) return false;
  }
  return lines === 1 || lines === 2;
}

/** A stroked square opens a box; a mark drawn inside one checks it. */
function noteBox(out: OpWalk, rect: PdfRect, path: unknown): void {
  const mark = isMark(path);
  const box = out.boxes.find((entry) => within(rect, entry.rect));
  if (box !== undefined && mark) box.checked = true;
  else if (box === undefined && !mark && isBox(rect)) out.boxes.push({ rect, checked: false });
}

type Handler = (state: State, args: readonly unknown[]) => void;

const STROKES = ['stroke', 'closeStroke'];
const FILLS = [
  'fill',
  'eoFill',
  'fillStroke',
  'eoFillStroke',
  'closeFillStroke',
  'closeEOFillStroke',
];

function opCodes(ops: OpsTable, names: readonly string[]): Set<number> {
  return new Set(
    names.map((name) => ops[name]).filter((value): value is number => value !== undefined)
  );
}

/** The upright box a painted path covers on the page, or null when the operator painted nothing. */
function paintedBox(state: State, args: readonly unknown[], painted: Set<number>): PdfRect | null {
  const [op, , minMax] = args;
  if (typeof op !== 'number' || !painted.has(op)) return null;
  const bounds = numbersOf(minMax);
  if (bounds === null || bounds.length < 4) return null;
  const [minX = 0, minY = 0, maxX = 0, maxY = 0] = bounds;
  return transformedBox(state.ctm, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function constructPath(
  state: State,
  args: readonly unknown[],
  painted: Set<number>,
  stroked: Set<number>
): void {
  const rect = paintedBox(state, args, painted);
  if (rect === null) return;
  if (isRule(rect)) state.out.rules.push(rect);
  else if (stroked.has(args[0] as number)) noteBox(state.out, rect, args[1]);
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

/** The pen's operators (text-pen.ts), each handed the walk's pen. */
const PEN_HANDLERS: Record<string, Handler> = Object.fromEntries(
  Object.entries(PEN_OPS).map(([name, op]) => [name, (state, args) => op(state.pen, args)])
);

function handlers(ops: OpsTable): Map<number, Handler> {
  const painted = opCodes(ops, [...FILLS, ...STROKES]);
  const stroked = opCodes(ops, STROKES);
  const table: Record<string, Handler> = {
    ...PEN_HANDLERS,
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
      const shape = glyphShape(glyphs, state.pen.spaced);
      showWithPen(state.pen, glyphs, shape.endsSpaced);
      state.out.texts.push({ colorHex: state.fill, hidden: state.hidden, ...shape });
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
      const own = matrixOf(matrix);
      if (own !== null) state.ctm = multiply(own, state.ctm);
    },
    paintFormXObjectEnd: (state) => {
      state.ctm = state.stack.pop() ?? IDENTITY;
    },
    constructPath: (state, args) => constructPath(state, args, painted, stroked),
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
    pen: newPen(),
    out: { texts: [], images: [], rules: [], boxes: [] },
  };
  const table = handlers(ops);
  list.fnArray.forEach((fn, index) => {
    const args = list.argsArray[index];
    table.get(fn)?.(state, Array.isArray(args) ? args : []);
  });
  return state.out;
}

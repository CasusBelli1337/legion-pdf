/**
 * TEST SUPPORT ONLY — never imported by shipping code.
 *
 * Stamps are proved by reading the page's own content stream, because that is
 * the claim being made: the ink is IN the page, at a known place, at a known
 * angle, with no annotation behind it. Text extraction alone would pass a stamp
 * that landed off the paper or upside down on a rotated page.
 *
 * (Whole-file residue checks stay in core/ops/test-fixtures.ts — `containsText`
 * there inflates every stream and is the right tool for "is this string gone".)
 */

import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import type { PdfPoint } from '@shared/types';

/** [a, b, c, d, e, f] as `cm` and `Tm` take it. */
export type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(left: Matrix, right: Matrix): Matrix {
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

/** Where a matrix puts a point. */
export function place(matrix: Matrix, point: PdfPoint): PdfPoint {
  const [a, b, c, d, e, f] = matrix;
  return { x: point.x * a + point.y * c + e, y: point.x * b + point.y * d + f };
}

/** Counter-clockwise turn a matrix applies, in degrees, folded to 0..359. */
export function angleOf(matrix: Matrix): number {
  const degrees = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  return Math.round(((degrees % 360) + 360) % 360);
}

/** One thing drawn into a content stream, with the matrix that placed it. */
export interface DrawnMark {
  kind: 'text' | 'rect' | 'image';
  matrix: Matrix;
  /** Decoded string for text marks. */
  text: string;
  /** Path extent for rectangles, in the matrix's own units. */
  width: number;
  height: number;
  /** XObject name for image marks. */
  name: string;
}

/** Every content stream of one 1-based page, decoded and concatenated. */
export async function pageContent(bytes: Uint8Array, page: number): Promise<string> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const node = document.getPage(page - 1).node;
  const value = document.context.lookup(node.get(PDFName.of('Contents')));
  const streams =
    value instanceof PDFArray
      ? value.asArray().map((ref) => document.context.lookup(ref))
      : [value];
  const decoder = new TextDecoder('latin1');
  return streams
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => decoder.decode(decodePDFRawStream(stream).decode()))
    .join('\n');
}

const TOKENS = /<[0-9A-Fa-f\s]*>|\/[^\s/<>[\]()]+|[^\s]+/g;

function decodeHex(token: string): string {
  const hex = token.slice(1, -1).replace(/\s+/g, '');
  const pairs = hex.match(/../g) ?? [];
  return pairs.map((pair) => String.fromCharCode(Number.parseInt(pair, 16))).join('');
}

interface ScanState {
  stack: Matrix[];
  ctm: Matrix;
  text: Matrix;
  path: { width: number; height: number };
  marks: DrawnMark[];
}

function numbersAt(operands: string[], count: number): Matrix {
  const values = operands.slice(-count).map(Number);
  return [
    values[0] ?? 0,
    values[1] ?? 0,
    values[2] ?? 0,
    values[3] ?? 0,
    values[4] ?? 0,
    values[5] ?? 0,
  ];
}

const HANDLERS: Record<string, (state: ScanState, operands: string[]) => void> = {
  q: (state) => {
    state.stack.push(state.ctm);
  },
  Q: (state) => {
    state.ctm = state.stack.pop() ?? IDENTITY;
  },
  cm: (state, operands) => {
    state.ctm = multiply(numbersAt(operands, 6), state.ctm);
  },
  Tm: (state, operands) => {
    state.text = multiply(numbersAt(operands, 6), state.ctm);
  },
  Tj: (state, operands) => {
    const token = operands.at(-1) ?? '';
    state.marks.push(mark('text', state.text, { text: decodeHex(token) }));
  },
  l: (state, operands) => {
    const [x = 0, y = 0] = operands.slice(-2).map(Number);
    state.path = { width: Math.max(state.path.width, x), height: Math.max(state.path.height, y) };
  },
  Do: (state, operands) => {
    state.marks.push(mark('image', state.ctm, { name: (operands.at(-1) ?? '').slice(1) }));
  },
};

/** Every operator that ends a path by painting it — fill, stroke, or both. */
for (const painter of ['f', 'F', 'f*', 'S', 's', 'B', 'B*', 'b', 'b*']) {
  HANDLERS[painter] = (state) => {
    state.marks.push(mark('rect', state.ctm, state.path));
    state.path = { width: 0, height: 0 };
  };
}

function mark(kind: DrawnMark['kind'], matrix: Matrix, extra: Partial<DrawnMark>): DrawnMark {
  return { kind, matrix, text: '', width: 0, height: 0, name: '', ...extra };
}

/** Walks a content stream and reports every mark it draws, in order. */
export function scanMarks(content: string): DrawnMark[] {
  const state: ScanState = {
    stack: [],
    ctm: IDENTITY,
    text: IDENTITY,
    path: { width: 0, height: 0 },
    marks: [],
  };
  let operands: string[] = [];
  for (const [token] of content.matchAll(TOKENS)) {
    const handler = HANDLERS[token];
    if (handler === undefined) {
      operands.push(token);
      continue;
    }
    handler(state, operands);
    operands = [];
  }
  return state.marks;
}

/** Every mark drawn on one 1-based page of a saved document. */
export async function marksOnPage(bytes: Uint8Array, page: number): Promise<DrawnMark[]> {
  return scanMarks(await pageContent(bytes, page));
}

/** Text marks only — the strings a stamp put on the page, with their placement. */
export async function textMarksOnPage(bytes: Uint8Array, page: number): Promise<DrawnMark[]> {
  return (await marksOnPage(bytes, page)).filter((found) => found.kind === 'text');
}

/**
 * The geometry half of flattening: find an annotation's normal appearance
 * stream and work out the matrix that lands it exactly on its /Rect.
 *
 * PDF 32000-1 §12.5.5: transform the form's /BBox by its /Matrix, take the
 * bounding box of the result, then scale and shift THAT onto the annotation
 * rectangle. Skipping this step is why naive flattening puts signatures in the
 * wrong place or at the wrong size.
 */

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, PDFStream } from 'pdf-lib';
import type { PDFDocument, PDFObject } from 'pdf-lib';

/** [a b c d e f] as the `cm` operator takes it. */
export type TransformMatrix = [number, number, number, number, number, number];
const IDENTITY: TransformMatrix = [1, 0, 0, 1, 0, 0];
/** /F bit 2 — an annotation the reader is told not to show. */
const HIDDEN_FLAG = 2;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function numbersOf(array: PDFArray | undefined, expected: number): number[] | undefined {
  if (array === undefined || array.size() < expected) return undefined;
  const values: number[] = [];
  for (let index = 0; index < expected; index += 1) {
    const value = array.lookupMaybe(index, PDFNumber);
    if (value === undefined) return undefined;
    values.push(value.asNumber());
  }
  return values;
}

function boxOf(values: number[]): Box {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = values;
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

function applyMatrix(matrix: TransformMatrix, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  return [a * x + c * y + e, b * x + d * y + f];
}

function transformedBounds(box: Box, matrix: TransformMatrix): Box {
  const corners: [number, number][] = [
    applyMatrix(matrix, box.minX, box.minY),
    applyMatrix(matrix, box.maxX, box.minY),
    applyMatrix(matrix, box.maxX, box.maxY),
    applyMatrix(matrix, box.minX, box.maxY),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function scale(target: number, source: number): number {
  return source === 0 ? 1 : target / source;
}

export function isHidden(annotation: PDFDict): boolean {
  const flags = annotation.lookupMaybe(PDFName.of('F'), PDFNumber)?.asNumber() ?? 0;
  return (flags & HIDDEN_FLAG) !== 0;
}

/** The /AP /N stream, following the /AS state when the appearance has states. */
export function appearanceStreamRef(
  document: PDFDocument,
  annotation: PDFDict
): PDFRef | undefined {
  const appearances = annotation.lookupMaybe(PDFName.of('AP'), PDFDict);
  const normal = appearances?.get(PDFName.of('N'));
  const direct = asStreamRef(document, normal);
  if (direct !== undefined) return direct;

  const states = appearances?.lookupMaybe(PDFName.of('N'), PDFDict);
  if (states === undefined) return undefined;
  const selected = annotation.lookupMaybe(PDFName.of('AS'), PDFName);
  const key = selected ?? states.keys().at(0);
  return key === undefined ? undefined : asStreamRef(document, states.get(key));
}

function asStreamRef(document: PDFDocument, value: PDFObject | undefined): PDFRef | undefined {
  if (value instanceof PDFRef) {
    return document.context.lookupMaybe(value, PDFStream) === undefined ? undefined : value;
  }
  return value instanceof PDFStream ? document.context.register(value) : undefined;
}

/** Marks a bare appearance stream as the form XObject it is about to be used as. */
export function ensureFormXObject(stream: PDFStream): void {
  stream.dict.set(PDFName.of('Type'), PDFName.of('XObject'));
  stream.dict.set(PDFName.of('Subtype'), PDFName.of('Form'));
}

/** The `cm` matrix that puts this appearance on its annotation rectangle. */
export function appearanceMatrix(annotation: PDFDict, stream: PDFStream): TransformMatrix {
  const rectValues = numbersOf(annotation.lookupMaybe(PDFName.of('Rect'), PDFArray), 4);
  const bboxValues = numbersOf(stream.dict.lookupMaybe(PDFName.of('BBox'), PDFArray), 4);
  if (rectValues === undefined || bboxValues === undefined) return IDENTITY;

  const rect = boxOf(rectValues);
  const matrixValues = numbersOf(stream.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray), 6);
  const matrix = (matrixValues as TransformMatrix | undefined) ?? IDENTITY;
  const bounds = transformedBounds(boxOf(bboxValues), matrix);

  const sx = scale(rect.maxX - rect.minX, bounds.maxX - bounds.minX);
  const sy = scale(rect.maxY - rect.minY, bounds.maxY - bounds.minY);
  return [sx, 0, 0, sy, rect.minX - bounds.minX * sx, rect.minY - bounds.minY * sy];
}

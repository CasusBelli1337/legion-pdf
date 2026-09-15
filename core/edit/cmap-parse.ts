/**
 * Reading a `/ToUnicode` CMap: the table a PDF writer leaves behind saying
 * which character each code in a font stands for. It is what makes text in an
 * embedded subset font (Word's Type0 / Identity-H output above all) readable —
 * and, run backwards, what lets an edit be re-encoded in that same font.
 *
 * The content-stream lexer already knows hex strings, numbers, and bare
 * keywords, which is all a CMap is made of, so it is reused here rather than
 * writing a second PostScript scanner.
 */

import { tokenize, type StreamToken } from './content-lexer';

export interface ToUnicodeMap {
  /** Code → the character(s) it shows. A ligature maps to two or three. */
  forward: Map<number, string>;
  /** Bytes per code the codespace declares; 1 or 2 (mixed spaces read as 2). */
  codeBytes: 1 | 2;
}

function codeOf(token: StreamToken): number {
  return token.bytes.reduce((value, byte) => (value << 8) | byte, 0);
}

/** UTF-16BE bytes → string, surrogate pairs included. */
function textOf(token: StreamToken): string {
  const units: number[] = [];
  for (let index = 0; index + 1 < token.bytes.length; index += 2) {
    units.push(((token.bytes[index] ?? 0) << 8) | (token.bytes[index + 1] ?? 0));
  }
  // A one-byte destination is a plain Latin-1 character (seen in the wild).
  if (units.length === 0 && token.bytes.length === 1) {
    return String.fromCharCode(token.bytes[0] ?? 0);
  }
  return String.fromCharCode(...units);
}

/** The destination string advanced by `step` code points, as bfrange does. */
function advanced(text: string, step: number): string {
  if (text.length === 0) return text;
  const last = text.codePointAt(text.length - 1) ?? 0;
  return text.slice(0, -1) + String.fromCodePoint(last + step);
}

/** Runs one `bfrange` triple, in either of its two forms. */
function applyRange(
  map: Map<number, string>,
  low: StreamToken,
  high: StreamToken,
  destination: StreamToken[]
): void {
  const from = codeOf(low);
  const to = codeOf(high);
  if (to < from || to - from > 65535) return;
  if (destination.length === 1 && destination[0] !== undefined) {
    const base = textOf(destination[0]);
    for (let code = from; code <= to; code += 1) map.set(code, advanced(base, code - from));
    return;
  }
  destination.forEach((token, index) => {
    if (from + index <= to) map.set(from + index, textOf(token));
  });
}

type SectionKind = 'char' | 'range' | 'codespace' | 'none';

function flushChar(map: Map<number, string>, operands: StreamToken[]): void {
  for (let index = 0; index + 1 < operands.length; index += 2) {
    const source = operands[index];
    const target = operands[index + 1];
    if (source !== undefined && target !== undefined) map.set(codeOf(source), textOf(target));
  }
}

function flushRange(map: Map<number, string>, operands: StreamToken[]): void {
  let index = 0;
  while (index + 2 < operands.length) {
    const low = operands[index];
    const high = operands[index + 1];
    const destination = operands[index + 2];
    if (low === undefined || high === undefined || destination === undefined) break;
    if (destination.kind === 'arrayOpen') {
      const close = operands.findIndex((token, at) => at > index && token.kind === 'arrayClose');
      if (close < 0) break;
      applyRange(map, low, high, operands.slice(index + 3, close));
      index = close + 1;
      continue;
    }
    applyRange(map, low, high, [destination]);
    index += 3;
  }
}

const OPENERS: Record<string, SectionKind> = {
  beginbfchar: 'char',
  beginbfrange: 'range',
  begincodespacerange: 'codespace',
};

function codeBytesOf(operands: StreamToken[]): 1 | 2 {
  const widest = Math.max(1, ...operands.map((entry) => entry.bytes.length));
  return widest >= 2 ? 2 : 1;
}

/** Parses a decoded ToUnicode stream. Tolerant: a malformed section is skipped. */
export function parseToUnicode(content: Uint8Array): ToUnicodeMap {
  const forward = new Map<number, string>();
  let codeBytes: 1 | 2 = 1;
  let kind: SectionKind = 'none';
  let operands: StreamToken[] = [];
  for (const token of tokenize(content)) {
    if (token.kind !== 'operator') {
      if (kind !== 'none') operands.push(token);
      continue;
    }
    const opened = OPENERS[token.text];
    if (opened !== undefined) {
      kind = opened;
      operands = [];
      continue;
    }
    if (!token.text.startsWith('end')) continue;
    if (kind === 'char') flushChar(forward, operands);
    if (kind === 'range') flushRange(forward, operands);
    if (kind === 'codespace') codeBytes = codeBytesOf(operands);
    kind = 'none';
    operands = [];
  }
  return { forward, codeBytes };
}

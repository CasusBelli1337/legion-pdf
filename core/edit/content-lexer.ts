/**
 * Tokenizing a page's content stream WITH BYTE OFFSETS.
 *
 * core/ocr/content-text.ts answers one question ("how many characters does this
 * page show?") and throws the positions away. Editing needs the other half: the
 * exact byte range every token occupies, so a rewrite can splice one operator
 * out and leave every other byte of the page untouched.
 *
 * Byte classes dispatch through a table rather than an if-chain (config over
 * code), the same shape content-text.ts uses — this is that scanner
 * productionised, not a second dialect of it.
 */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const DECODER = new TextDecoder('latin1');

export type TokenKind = 'string' | 'number' | 'name' | 'arrayOpen' | 'arrayClose' | 'operator';

export interface StreamToken {
  kind: TokenKind;
  /** Byte offset of the token's first byte within the stream. */
  start: number;
  /** Byte offset one past the token's last byte. */
  end: number;
  /** Latin-1 text of the token — numbers, names, and operators. */
  text: string;
  /** The character codes a string token shows. Empty for every other kind. */
  bytes: number[];
}

function isRegular(code: number): boolean {
  return !WHITESPACE.has(code) && !DELIMITERS.has(code);
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** `\n`, `\r`, `\t`, `\b`, `\f` — every escape that names a byte. */
const NAMED_ESCAPES: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 };

function isOctal(code: number | undefined): boolean {
  return code !== undefined && code >= 0x30 && code <= 0x37;
}

function readOctalEscape(content: Uint8Array, index: number, out: number[]): number {
  let digits = '';
  let cursor = index + 1;
  while (digits.length < 3 && isOctal(content[cursor])) {
    digits += String.fromCharCode(content[cursor] ?? 0);
    cursor += 1;
  }
  out.push(Number.parseInt(digits, 8) & 0xff);
  return cursor - index;
}

/** `\ddd`, `\n`, a line continuation, or a literal escape. Returns bytes consumed. */
function readEscape(content: Uint8Array, index: number, out: number[]): number {
  const next = content[index + 1];
  if (next === undefined) return 2;
  if (isOctal(next)) return readOctalEscape(content, index, out);
  const mapped = NAMED_ESCAPES[next];
  if (mapped !== undefined) out.push(mapped);
  // A backslash before a newline is a line continuation: it shows nothing.
  else if (next !== 0x0a && next !== 0x0d) out.push(next);
  return next === 0x0d && content[index + 2] === 0x0a ? 3 : 2;
}

/** `( ... )` with balanced inner parens, backslash escapes, and octal codes. */
function scanLiteral(content: Uint8Array, start: number): StreamToken {
  const bytes: number[] = [];
  let depth = 1;
  let index = start + 1;
  while (index < content.length && depth > 0) {
    const code = content[index] ?? 0;
    if (code === 0x5c) {
      index += readEscape(content, index, bytes);
      continue;
    }
    if (code === 0x28) depth += 1;
    if (code === 0x29) depth -= 1;
    if (depth > 0) bytes.push(code);
    index += 1;
  }
  return { kind: 'string', start, end: index, text: '', bytes };
}

/** `< ... >` hex string. Two hex digits per byte; a trailing odd digit pads with 0. */
function scanHex(content: Uint8Array, start: number): StreamToken {
  let digits = '';
  let index = start + 1;
  while (index < content.length && content[index] !== 0x3e) {
    const code = content[index] ?? 0;
    if (!WHITESPACE.has(code)) digits += String.fromCharCode(code);
    index += 1;
  }
  if (digits.length % 2 === 1) digits += '0';
  const bytes: number[] = [];
  for (let pair = 0; pair < digits.length; pair += 2) {
    bytes.push(Number.parseInt(digits.slice(pair, pair + 2), 16) & 0xff);
  }
  return { kind: 'string', start, end: index + 1, text: '', bytes };
}

function scanRegular(content: Uint8Array, start: number): StreamToken {
  let index = start;
  while (index < content.length && isRegular(content[index] ?? 0)) index += 1;
  const text = DECODER.decode(content.subarray(start, index));
  return { kind: NUMBER.test(text) ? 'number' : 'operator', start, end: index, text, bytes: [] };
}

function skipComment(content: Uint8Array, start: number): number {
  let index = start;
  while (index < content.length && content[index] !== 0x0a && content[index] !== 0x0d) index += 1;
  return index;
}

function bracket(kind: TokenKind, start: number): StreamToken {
  return { kind, start, end: start + 1, text: '', bytes: [] };
}

function name(content: Uint8Array, start: number): StreamToken {
  const scanned = scanRegular(content, start + 1);
  return { kind: 'name', start, end: scanned.end, text: scanned.text, bytes: [] };
}

function push(tokens: StreamToken[], token: StreamToken): number {
  tokens.push(token);
  return Math.max(token.end, token.start + 1);
}

/** Consumes the token starting at `index` and returns the index just past it. */
type Scan = (content: Uint8Array, index: number, tokens: StreamToken[]) => number;

const skipByte: Scan = (_content, index) => index + 1;
const literal: Scan = (content, index, tokens) => push(tokens, scanLiteral(content, index));
const arrayOpen: Scan = (_content, index, tokens) => push(tokens, bracket('arrayOpen', index));
const arrayClose: Scan = (_content, index, tokens) => push(tokens, bracket('arrayClose', index));
const nameToken: Scan = (content, index, tokens) => push(tokens, name(content, index));
const regular: Scan = (content, index, tokens) => push(tokens, scanRegular(content, index));

/** `<<` opens a dictionary this walks straight past; a lone `<` opens a string. */
const angle: Scan = (content, index, tokens) =>
  content[index + 1] === 0x3c ? index + 2 : push(tokens, scanHex(content, index));

const closeAngle: Scan = (content, index) => index + (content[index + 1] === 0x3e ? 2 : 1);

const SCANNERS = new Map<number, Scan>([
  [0x25, (content, index) => skipComment(content, index)],
  [0x28, literal],
  [0x3c, angle],
  [0x3e, closeAngle],
  [0x5b, arrayOpen],
  [0x5d, arrayClose],
  [0x2f, nameToken],
  [0x7b, skipByte],
  [0x7d, skipByte],
]);
for (const code of WHITESPACE) SCANNERS.set(code, skipByte);

/**
 * Every token in one content stream, in order. Dictionaries (`<< >>`) and
 * procedure braces are walked past rather than reported, which is all an editor
 * needs: it never rewrites them.
 */
export function tokenize(content: Uint8Array): StreamToken[] {
  const tokens: StreamToken[] = [];
  let index = 0;
  while (index < content.length) {
    const scan = SCANNERS.get(content[index] ?? 0) ?? regular;
    index = Math.max(scan(content, index, tokens), index + 1);
  }
  return tokens;
}

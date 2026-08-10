/**
 * How many characters does a page's content stream actually SHOW?
 *
 * That single number is the text-layer detector: a scanned page draws one image
 * and shows nothing, while a born-digital page (or a page we have already
 * OCR'd) shows hundreds of characters. Counting characters rather than
 * operators keeps a lone stamped page number from passing as a text layer.
 *
 * A real tokenizer rather than a regex, because PDF strings may contain
 * parentheses, escapes, and anything that looks like an operator. Byte classes
 * dispatch through a table instead of an if-chain (config over code).
 */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/** Operators that show the preceding string operand. `TJ` shows an array. */
const SHOW_STRING = new Set(['Tj', "'", '"']);

const DECODER = new TextDecoder('latin1');

interface CountState {
  shown: number;
  lastString: number;
  arrayStrings: number;
  inArray: boolean;
}

/** Consumes one token starting at `index`; returns the index just past it. */
type Handler = (content: Uint8Array, index: number, state: CountState) => number;

function isRegular(code: number): boolean {
  return !WHITESPACE.has(code) && !DELIMITERS.has(code);
}

function applyOperator(name: string, state: CountState): void {
  if (SHOW_STRING.has(name)) state.shown += state.lastString;
  if (name === 'TJ') state.shown += state.arrayStrings;
}

function recordString(state: CountState, length: number): void {
  state.lastString = length;
  if (state.inArray) state.arrayStrings += length;
}

/** `( ... )` with balanced inner parens, backslash escapes, and octal codes. */
function scanLiteralString(bytes: Uint8Array, start: number): { end: number; length: number } {
  let depth = 1;
  let length = 0;
  let index = start + 1;
  while (index < bytes.length && depth > 0) {
    const code = bytes[index];
    if (code === 0x5c) {
      const escaped = bytes[index + 1];
      index += escaped !== undefined && escaped >= 0x30 && escaped <= 0x37 ? 4 : 2;
      length += 1;
      continue;
    }
    if (code === 0x28) depth += 1;
    if (code === 0x29) depth -= 1;
    if (depth > 0) length += 1;
    index += 1;
  }
  return { end: index, length };
}

/** `< ... >` hex string — two hex digits per character, an odd digit padded. */
function scanHexString(bytes: Uint8Array, start: number): { end: number; length: number } {
  let digits = 0;
  let index = start + 1;
  while (index < bytes.length && bytes[index] !== 0x3e) {
    if (!WHITESPACE.has(bytes[index] ?? 0)) digits += 1;
    index += 1;
  }
  return { end: index + 1, length: Math.ceil(digits / 2) };
}

function scanRegularToken(bytes: Uint8Array, start: number): number {
  let index = start;
  while (index < bytes.length && isRegular(bytes[index] ?? 0)) index += 1;
  return index;
}

const handleWhitespace: Handler = (_content, index) => index + 1;

const handleComment: Handler = (content, index) => {
  let cursor = index;
  while (cursor < content.length && content[cursor] !== 0x0a && content[cursor] !== 0x0d) {
    cursor += 1;
  }
  return cursor;
};

const handleLiteralString: Handler = (content, index, state) => {
  const scan = scanLiteralString(content, index);
  recordString(state, scan.length);
  return scan.end;
};

/** `<<` opens a dictionary; a lone `<` opens a hex string. */
const handleAngle: Handler = (content, index, state) => {
  if (content[index + 1] === 0x3c) return index + 2;
  const scan = scanHexString(content, index);
  recordString(state, scan.length);
  return scan.end;
};

const handleArrayStart: Handler = (_content, index, state) => {
  state.inArray = true;
  state.arrayStrings = 0;
  return index + 1;
};

const handleArrayEnd: Handler = (_content, index, state) => {
  state.inArray = false;
  return index + 1;
};

const handleQuoteOperator: Handler = (content, index, state) => {
  applyOperator(String.fromCharCode(content[index] ?? 0), state);
  return index + 1;
};

/** `/Name` is an operand, never an operator — skip it whole. */
const handleName: Handler = (content, index) => scanRegularToken(content, index + 1);

const handleToken: Handler = (content, index, state) => {
  if (!isRegular(content[index] ?? 0)) return index + 1;
  const end = scanRegularToken(content, index);
  applyOperator(DECODER.decode(content.subarray(index, end)), state);
  return end;
};

const HANDLERS = new Map<number, Handler>([
  [0x25, handleComment],
  [0x28, handleLiteralString],
  [0x3c, handleAngle],
  [0x5b, handleArrayStart],
  [0x5d, handleArrayEnd],
  [0x27, handleQuoteOperator],
  [0x22, handleQuoteOperator],
  [0x2f, handleName],
]);
for (const code of WHITESPACE) HANDLERS.set(code, handleWhitespace);

/**
 * Characters shown by a decoded content stream. Zero means the page draws no
 * text at all — the signature of a scan that needs OCR.
 */
export function countShownCharacters(content: Uint8Array): number {
  const state: CountState = { shown: 0, lastString: 0, arrayStrings: 0, inArray: false };
  let index = 0;
  while (index < content.length) {
    const handler = HANDLERS.get(content[index] ?? 0) ?? handleToken;
    const next = handler(content, index, state);
    index = next > index ? next : index + 1;
  }
  return state.shown;
}

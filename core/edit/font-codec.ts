/**
 * Reading and writing a font's character codes: what each code on the page
 * SAYS, and — run backwards — which codes would say the text the attorney has
 * typed. This is the "font reality check" real text editing turns on. A subset
 * font that never carried an é cannot be made to show one, and the codec says
 * so by name rather than letting a blank glyph reach the page.
 *
 * Sources, in the order a reader trusts them: the `/ToUnicode` map the writer
 * left behind; for simple fonts, the named base encoding plus `/Differences`;
 * for embedded TrueType programs, the `loca` table decides whether a glyph is
 * actually there.
 */

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { BOLD_NAME, ITALIC_NAME, stripSubsetPrefix } from '@shared/font-family-rules';
import { parseToUnicode } from './cmap-parse';
import { applyDifferences, baseEncodingTable, isBaseEncodingName } from './encodings';
import { parseTrueType, type TrueTypeGlyphs } from './truetype-glyphs';

export interface Encoded {
  codes: number[];
  /** Characters the font cannot show, de-duplicated, in the order typed. */
  missing: string[];
}

export interface FontCodec {
  /** The file's name for the face, subset prefix stripped. */
  baseFont: string;
  subset: boolean;
  embedded: boolean;
  codeBytes: 1 | 2;
  bold: boolean;
  italic: boolean;
  /** The descriptor's own word for the design: what a stand-in face should be. */
  family: 'serif' | 'sans-serif' | 'monospace';
  /** True when at least the characters already on the page can be re-set. */
  reusable: boolean;
  /** What one code shows, or undefined when the file gives no answer. */
  decode(code: number): string | undefined;
  encode(text: string): Encoded;
}

const FLAG_FIXED_PITCH = 1;
const FLAG_SERIF = 2;
const FLAG_SYMBOLIC = 4;
const FLAG_ITALIC = 64;
const FLAG_FORCE_BOLD = 262144;

function nameOf(dict: PDFDict | undefined, key: string): string {
  return dict?.lookupMaybe(PDFName.of(key), PDFName)?.decodeText() ?? '';
}

function numberOf(dict: PDFDict | undefined, key: string): number | undefined {
  return dict?.lookupMaybe(PDFName.of(key), PDFNumber)?.asNumber();
}

function streamBytes(dict: PDFDict | undefined, key: string): Uint8Array | null {
  const stream = dict?.lookup(PDFName.of(key));
  if (!(stream instanceof PDFRawStream)) return null;
  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
}

/** The embedded program, when there is one: a parsed TrueType, or a marker for the rest. */
function programOf(descriptor: PDFDict | undefined): {
  embedded: boolean;
  program: TrueTypeGlyphs | null;
} {
  const trueType = streamBytes(descriptor, 'FontFile2');
  if (trueType !== null) return { embedded: true, program: parseTrueType(trueType) };
  const other =
    descriptor?.has(PDFName.of('FontFile')) === true ||
    descriptor?.has(PDFName.of('FontFile3')) === true;
  return { embedded: other, program: null };
}

/** The Type0 font's one descendant, or the simple font itself. */
function descriptorOf(font: PDFDict, descendant: PDFDict | undefined): PDFDict | undefined {
  return (descendant ?? font).lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
}

function descendantOf(font: PDFDict): PDFDict | undefined {
  return font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)?.lookupMaybe(0, PDFDict);
}

function styleOf(
  baseFont: string,
  descriptor: PDFDict | undefined
): { bold: boolean; italic: boolean; family: FontCodec['family'] } {
  const flags = numberOf(descriptor, 'Flags') ?? 0;
  const stemV = numberOf(descriptor, 'StemV') ?? 0;
  const italicAngle = numberOf(descriptor, 'ItalicAngle') ?? 0;
  const family =
    (flags & FLAG_FIXED_PITCH) !== 0
      ? 'monospace'
      : (flags & FLAG_SERIF) !== 0
        ? 'serif'
        : 'sans-serif';
  return {
    bold: BOLD_NAME.test(baseFont) || (flags & FLAG_FORCE_BOLD) !== 0 || stemV >= 120,
    italic: ITALIC_NAME.test(baseFont) || (flags & FLAG_ITALIC) !== 0 || italicAngle !== 0,
    family,
  };
}

/** Smart-quote stand-ins: when the plain key is missing, Word's curly cut usually is not. */
const STAND_INS: Record<string, string[]> = {
  "'": ['’'],
  '"': ['”', '“'],
  ' ': [' '],
  '-': ['‐', '−'],
};

const WHITESPACE = /^\s$/;

interface Tables {
  forward: Map<number, string>;
  reverse: Map<string, number>;
  hasGlyph(code: number): boolean;
}

function reverseOf(forward: Map<number, string>): Map<string, number> {
  const reverse = new Map<string, number>();
  for (const [code, text] of forward) {
    if (!reverse.has(text)) reverse.set(text, code);
  }
  return reverse;
}

/** Codes with a non-zero `/Widths` entry — a subset writer's own list of what it kept. */
function widthHints(font: PDFDict): Set<number> | null {
  const widths = font.lookupMaybe(PDFName.of('Widths'), PDFArray);
  const first = numberOf(font, 'FirstChar');
  if (widths === undefined || first === undefined) return null;
  const kept = new Set<number>();
  for (let index = 0; index < widths.size(); index += 1) {
    if ((widths.lookupMaybe(index, PDFNumber)?.asNumber() ?? 0) > 0) kept.add(first + index);
  }
  return kept;
}

/** `/CIDToGIDMap`: Identity, or a stream of big-endian glyph ids per CID. */
function cidToGid(descendant: PDFDict | undefined): (cid: number) => number {
  const bytes = streamBytes(descendant, 'CIDToGIDMap');
  if (bytes === null) return (cid) => cid;
  return (cid) =>
    cid * 2 + 1 < bytes.length ? ((bytes[cid * 2] ?? 0) << 8) | (bytes[cid * 2 + 1] ?? 0) : 0;
}

function type0Tables(
  font: PDFDict,
  descendant: PDFDict | undefined,
  program: TrueTypeGlyphs | null
): Tables {
  const toUnicode = streamBytes(font, 'ToUnicode');
  const forward =
    toUnicode === null ? new Map<number, string>() : parseToUnicode(toUnicode).forward;
  const gidOf = cidToGid(descendant);
  return {
    forward,
    reverse: reverseOf(forward),
    hasGlyph: (code) => (program === null ? forward.has(code) : program.hasOutline(gidOf(code))),
  };
}

function simpleBaseTable(
  font: PDFDict,
  isTrueType: boolean,
  symbolic: boolean
): (string | undefined)[] {
  const encoding = font.get(PDFName.of('Encoding'));
  const resolved = encoding === undefined ? undefined : font.context.lookup(encoding);
  const named = resolved instanceof PDFName ? resolved.decodeText() : '';
  const dict = resolved instanceof PDFDict ? resolved : undefined;
  const base = named !== '' ? named : nameOf(dict, 'BaseEncoding');
  const fallback = isTrueType && !symbolic ? 'WinAnsiEncoding' : 'StandardEncoding';
  const table = baseEncodingTable(isBaseEncodingName(base) ? base : fallback);
  const differences = dict?.lookupMaybe(PDFName.of('Differences'), PDFArray);
  if (differences !== undefined) {
    const entries = differences.asArray().map((entry) => {
      const value = font.context.lookup(entry);
      if (value instanceof PDFNumber) return value.asNumber();
      return value instanceof PDFName ? value.decodeText() : '';
    });
    applyDifferences(table, entries);
  }
  return table;
}

function simpleGlyphCheck(
  program: TrueTypeGlyphs | null,
  symbolic: boolean,
  forward: Map<number, string>,
  subsetHints: Set<number> | null
): (code: number) => boolean {
  if (program !== null) {
    return (code) => {
      const text = forward.get(code) ?? '';
      const gid =
        (symbolic ? program.symbolToGid(code) : undefined) ??
        program.unicodeToGid(text.codePointAt(0) ?? -1) ??
        program.macToGid(code) ??
        program.symbolToGid(code);
      // No map at all: codes index glyphs directly. A map that lacks the
      // character, or sends it to .notdef (glyph 0), means it is not there.
      if (gid === undefined) return !program.hasCmap && program.hasOutline(code);
      return gid !== 0 && program.hasOutline(gid);
    };
  }
  if (subsetHints !== null) return (code) => subsetHints.has(code);
  return () => true;
}

function simpleTables(
  font: PDFDict,
  descriptor: PDFDict | undefined,
  program: TrueTypeGlyphs | null,
  subset: boolean
): Tables {
  const symbolic = ((numberOf(descriptor, 'Flags') ?? 0) & FLAG_SYMBOLIC) !== 0;
  const isTrueType = nameOf(font, 'Subtype') === 'TrueType';
  const table = simpleBaseTable(font, isTrueType, symbolic);
  const toUnicode = streamBytes(font, 'ToUnicode');
  const mapped = toUnicode === null ? new Map<number, string>() : parseToUnicode(toUnicode).forward;
  const forward = new Map<number, string>();
  table.forEach((character, code) => {
    const known = mapped.get(code) ?? character;
    if (known !== undefined) forward.set(code, known);
  });
  for (const [code, text] of mapped) forward.set(code, text);
  const hints = subset && program === null ? widthHints(font) : null;
  return {
    forward,
    reverse: reverseOf(forward),
    hasGlyph: simpleGlyphCheck(program, symbolic, forward, hints),
  };
}

function encodeWith(
  tables: Tables,
  codeCheck: (code: number) => boolean
): (text: string) => Encoded {
  const codeFor = (character: string): number | undefined => {
    const candidates = [character, ...(STAND_INS[character] ?? [])];
    for (const candidate of candidates) {
      const code = tables.reverse.get(candidate);
      if (code !== undefined && (WHITESPACE.test(candidate) || codeCheck(code))) return code;
    }
    return undefined;
  };
  return (text) => {
    const codes: number[] = [];
    const missing: string[] = [];
    for (const character of text) {
      const code = codeFor(character);
      if (code === undefined) {
        if (!missing.includes(character)) missing.push(character);
        continue;
      }
      codes.push(code);
    }
    return { codes, missing };
  };
}

/** The codec for one font dictionary. Never throws: an unreadable font is simply not reusable. */
export function fontCodecOf(font: PDFDict): FontCodec {
  const subtype = nameOf(font, 'Subtype');
  const descendant = subtype === 'Type0' ? descendantOf(font) : undefined;
  const descriptor = descriptorOf(font, descendant);
  const rawName = nameOf(font, 'BaseFont');
  const baseFont = stripSubsetPrefix(rawName);
  const subset = rawName !== baseFont;
  const { embedded, program } = programOf(descriptor);
  const identity = subtype !== 'Type0' || /^Identity-[HV]$/.test(nameOf(font, 'Encoding'));
  const tables =
    subtype === 'Type0'
      ? type0Tables(font, descendant, program)
      : simpleTables(font, descriptor, program, subset);
  const encode = encodeWith(tables, tables.hasGlyph);
  return {
    baseFont,
    subset,
    embedded,
    codeBytes: subtype === 'Type0' ? 2 : 1,
    ...styleOf(baseFont, descriptor),
    reusable: identity && tables.reverse.size > 0,
    decode: (code) => tables.forward.get(code),
    encode: identity ? encode : () => ({ codes: [], missing: ['(unsupported encoding)'] }),
  };
}

/** Codecs for every font a resource dictionary names, keyed by `/Fn`. */
export function fontCodecsOf(resources: PDFDict | undefined): Map<string, FontCodec> {
  const codecs = new Map<string, FontCodec>();
  const fonts = resources?.lookupMaybe(PDFName.Font, PDFDict);
  if (fonts === undefined) return codecs;
  for (const [key] of fonts.entries()) {
    const font = fonts.lookupMaybe(key, PDFDict);
    if (font !== undefined) codecs.set(key.decodeText(), fontCodecOf(font));
  }
  return codecs;
}

/**
 * The single-byte encodings a simple font can name: which character each code
 * from 0 to 255 shows. WinAnsi and MacRoman are Windows-1252 and Mac Roman,
 * which the platform already knows how to decode, so only Standard — Adobe's
 * own, where 0x27 is a curly quote — is spelled out here.
 */

import { characterOfGlyphName } from './glyph-names';

/** StandardEncoding where it differs from ASCII / Latin-1, by code. */
const STANDARD_HIGH: Record<number, number> = {
  0x27: 0x2019,
  0x60: 0x2018,
  0xa1: 0x00a1,
  0xa2: 0x00a2,
  0xa3: 0x00a3,
  0xa4: 0x2044,
  0xa5: 0x00a5,
  0xa6: 0x0192,
  0xa7: 0x00a7,
  0xa8: 0x00a4,
  0xa9: 0x0027,
  0xaa: 0x201c,
  0xab: 0x00ab,
  0xac: 0x2039,
  0xad: 0x203a,
  0xae: 0xfb01,
  0xaf: 0xfb02,
  0xb1: 0x2013,
  0xb2: 0x2020,
  0xb3: 0x2021,
  0xb4: 0x00b7,
  0xb6: 0x00b6,
  0xb7: 0x2022,
  0xb8: 0x201a,
  0xb9: 0x201e,
  0xba: 0x201d,
  0xbb: 0x00bb,
  0xbc: 0x2026,
  0xbd: 0x2030,
  0xbf: 0x00bf,
  0xc1: 0x0060,
  0xc2: 0x00b4,
  0xc3: 0x02c6,
  0xc4: 0x02dc,
  0xc5: 0x00af,
  0xc6: 0x02d8,
  0xc7: 0x02d9,
  0xc8: 0x00a8,
  0xca: 0x02da,
  0xcb: 0x00b8,
  0xcd: 0x02dd,
  0xce: 0x02db,
  0xcf: 0x02c7,
  0xd0: 0x2014,
  0xe1: 0x00c6,
  0xe3: 0x00aa,
  0xe8: 0x0141,
  0xe9: 0x00d8,
  0xea: 0x0152,
  0xeb: 0x00ba,
  0xf1: 0x00e6,
  0xf5: 0x0131,
  0xf8: 0x0142,
  0xf9: 0x00f8,
  0xfa: 0x0153,
  0xfb: 0x00df,
};

export type BaseEncodingName =
  'WinAnsiEncoding' | 'MacRomanEncoding' | 'StandardEncoding' | 'MacExpertEncoding';

/**
 * Windows-1252's 0x80–0x9F, where it departs from Latin-1: the curly quotes,
 * dashes, bullet, and euro that Word documents are full of. Spelled out rather
 * than decoded, because Node's decoder for this label hands back C1 control
 * characters for exactly these codes. The five holes (0x81, 0x8D, 0x8F, 0x90,
 * 0x9D) show nothing.
 */
const WINANSI_HIGH: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function winAnsiTable(): (string | undefined)[] {
  return Array.from({ length: 256 }, (_unused, code) => {
    if (code < 0x20 || code === 0x7f) return undefined;
    if (code >= 0x80 && code <= 0x9f) {
      const high = WINANSI_HIGH[code];
      return high === undefined ? undefined : String.fromCodePoint(high);
    }
    return String.fromCharCode(code);
  });
}

function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/** Mac Roman through the platform decoder, which does carry that table. */
function macRomanTable(): (string | undefined)[] {
  const decoder = new TextDecoder('macintosh');
  return Array.from({ length: 256 }, (_unused, code) => {
    if (code < 0x20) return undefined;
    const character = decoder.decode(new Uint8Array([code]));
    return isControl(character) ? undefined : character;
  });
}

function standardTable(): (string | undefined)[] {
  return Array.from({ length: 256 }, (_unused, code) => {
    const high = STANDARD_HIGH[code];
    if (high !== undefined) return String.fromCodePoint(high);
    return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : undefined;
  });
}

const TABLES: Record<BaseEncodingName, () => (string | undefined)[]> = {
  WinAnsiEncoding: winAnsiTable,
  MacRomanEncoding: macRomanTable,
  StandardEncoding: standardTable,
  MacExpertEncoding: standardTable,
};

const cache = new Map<BaseEncodingName, (string | undefined)[]>();

/** Code → character for one named encoding; a fresh copy the caller may patch. */
export function baseEncodingTable(name: BaseEncodingName): (string | undefined)[] {
  let known = cache.get(name);
  if (known === undefined) {
    known = TABLES[name]();
    cache.set(name, known);
  }
  return [...known];
}

export function isBaseEncodingName(name: string): name is BaseEncodingName {
  return name in TABLES;
}

/** A `/Differences` array — `[32 /space /exclam 65 /A]` — applied to a table. */
export function applyDifferences(
  table: (string | undefined)[],
  differences: readonly (number | string)[]
): { unknownNames: string[] } {
  const unknownNames: string[] = [];
  let code = 0;
  for (const entry of differences) {
    if (typeof entry === 'number') {
      code = entry;
      continue;
    }
    const character = characterOfGlyphName(entry);
    if (character === undefined) unknownNames.push(entry);
    table[code] = character;
    code += 1;
  }
  return { unknownNames };
}

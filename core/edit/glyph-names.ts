/**
 * Glyph name → Unicode, for the names a `/Differences` array can use. This is
 * the slice of the Adobe Glyph List that Western legal documents actually
 * reach for: ASCII, Latin-1, the typographic punctuation Word substitutes, and
 * the f-ligatures. A name outside it is not guessed — `uniXXXX` and `uXXXX`
 * forms are decoded by pattern, anything else is reported as unknown so the
 * caller can refuse to edit rather than edit blind.
 */

const ASCII_NAMES =
  'space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright ' +
  'asterisk plus comma hyphen period slash zero one two three four five six seven eight nine ' +
  'colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W ' +
  'X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l ' +
  'm n o p q r s t u v w x y z braceleft bar braceright asciitilde';

const LATIN1_NAMES =
  'nbspace exclamdown cent sterling currency yen brokenbar section dieresis copyright ' +
  'ordfeminine guillemotleft logicalnot sfthyphen registered macron degree plusminus ' +
  'twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ' +
  'ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute ' +
  'Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave ' +
  'Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply ' +
  'Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute acircumflex ' +
  'atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute ' +
  'icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ' +
  'ugrave uacute ucircumflex udieresis yacute thorn ydieresis';

/** Names outside the two contiguous runs, with their code points. */
const OTHER_NAMES: Record<string, number> = {
  nonbreakingspace: 0x00a0,
  softhyphen: 0x00ad,
  quoteleft: 0x2018,
  quoteright: 0x2019,
  quotesinglbase: 0x201a,
  quotedblleft: 0x201c,
  quotedblright: 0x201d,
  quotedblbase: 0x201e,
  endash: 0x2013,
  emdash: 0x2014,
  bullet: 0x2022,
  ellipsis: 0x2026,
  dagger: 0x2020,
  daggerdbl: 0x2021,
  perthousand: 0x2030,
  guilsinglleft: 0x2039,
  guilsinglright: 0x203a,
  ff: 0xfb00,
  fi: 0xfb01,
  fl: 0xfb02,
  ffi: 0xfb03,
  ffl: 0xfb04,
  Euro: 0x20ac,
  trademark: 0x2122,
  minus: 0x2212,
  fraction: 0x2044,
  florin: 0x0192,
  circumflex: 0x02c6,
  tilde: 0x02dc,
  caron: 0x02c7,
  breve: 0x02d8,
  dotaccent: 0x02d9,
  ring: 0x02da,
  ogonek: 0x02db,
  hungarumlaut: 0x02dd,
  OE: 0x0152,
  oe: 0x0153,
  Scaron: 0x0160,
  scaron: 0x0161,
  Ydieresis: 0x0178,
  Zcaron: 0x017d,
  zcaron: 0x017e,
  Lslash: 0x0141,
  lslash: 0x0142,
  dotlessi: 0x0131,
  apostrophe: 0x0027,
  checkmark: 0x2713,
};

function table(): Map<string, number> {
  const map = new Map<string, number>();
  ASCII_NAMES.split(' ').forEach((name, index) => map.set(name, 0x20 + index));
  LATIN1_NAMES.split(' ').forEach((name, index) => map.set(name, 0xa0 + index));
  for (const [name, code] of Object.entries(OTHER_NAMES)) map.set(name, code);
  return map;
}

const GLYPHS = table();

/** `uni0041`, `u1F600`, or a listed name → the character; undefined when unknown. */
export function characterOfGlyphName(name: string): string | undefined {
  const known = GLYPHS.get(name);
  if (known !== undefined) return String.fromCodePoint(known);
  const uni = /^uni([0-9A-Fa-f]{4})/.exec(name);
  if (uni?.[1] !== undefined) return String.fromCodePoint(Number.parseInt(uni[1], 16));
  const u = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (u?.[1] !== undefined) return String.fromCodePoint(Number.parseInt(u[1], 16));
  return undefined;
}

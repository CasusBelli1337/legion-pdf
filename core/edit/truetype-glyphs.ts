/**
 * Which glyphs an embedded TrueType program actually contains.
 *
 * A subset font (`ABCDEF+Calibri`) carries only the glyphs the document used.
 * Its width table and even its character map may still list the rest, so the
 * only honest test for "can this font show an é the document never used" is
 * the `loca` table: a glyph with no outline data has zero length there. This
 * reads exactly the four tables that answer the question — `head`, `maxp`,
 * `loca`, `cmap` — and nothing else.
 *
 * CFF-flavoured OpenType (`OTTO`) keeps its outlines in a different structure;
 * it is reported as such and the caller falls back to the character map alone.
 */

interface Table {
  offset: number;
  length: number;
}

export interface TrueTypeGlyphs {
  numGlyphs: number;
  /** True when the program carries any character map at all. */
  hasCmap: boolean;
  /** True when the glyph has outline data (or is a composite). */
  hasOutline(gid: number): boolean;
  /** Unicode code point → glyph id via a (3,1)/(3,10)/(0,x) cmap, or undefined. */
  unicodeToGid(codePoint: number): number | undefined;
  /** A symbol font's (3,0) map, tried with the code and with 0xF000 + code. */
  symbolToGid(code: number): number | undefined;
  /** The Macintosh Roman (1,0) map, by single-byte code. */
  macToGid(code: number): number | undefined;
}

type Lookup = (code: number) => number | undefined;

function u16(view: DataView, at: number): number {
  return at + 2 <= view.byteLength ? view.getUint16(at) : 0;
}

function u32(view: DataView, at: number): number {
  return at + 4 <= view.byteLength ? view.getUint32(at) : 0;
}

function tag(view: DataView, at: number): string {
  return String.fromCharCode(
    view.getUint8(at),
    view.getUint8(at + 1),
    view.getUint8(at + 2),
    view.getUint8(at + 3)
  );
}

function directory(view: DataView): Map<string, Table> {
  const tables = new Map<string, Table>();
  const count = u16(view, 4);
  for (let index = 0; index < count; index += 1) {
    const at = 12 + index * 16;
    if (at + 16 > view.byteLength) break;
    tables.set(tag(view, at), { offset: u32(view, at + 8), length: u32(view, at + 12) });
  }
  return tables;
}

function locaOffsets(view: DataView, tables: Map<string, Table>): number[] {
  const head = tables.get('head');
  const maxp = tables.get('maxp');
  const loca = tables.get('loca');
  if (head === undefined || maxp === undefined || loca === undefined) return [];
  const long = view.getInt16(head.offset + 50) === 1;
  const numGlyphs = u16(view, maxp.offset + 4);
  const offsets: number[] = [];
  for (let gid = 0; gid <= numGlyphs; gid += 1) {
    const at = loca.offset + gid * (long ? 4 : 2);
    if (at + (long ? 4 : 2) > loca.offset + loca.length) break;
    offsets.push(long ? u32(view, at) : u16(view, at) * 2);
  }
  return offsets;
}

function format0(view: DataView, at: number): Lookup {
  return (code) => (code >= 0 && code < 256 ? view.getUint8(at + 6 + code) : undefined);
}

function format4(view: DataView, at: number): Lookup {
  const segments = u16(view, at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  return (code) => {
    for (let segment = 0; segment < segments; segment += 1) {
      if (u16(view, ends + segment * 2) < code) continue;
      const start = u16(view, starts + segment * 2);
      if (start > code) return undefined;
      const delta = u16(view, deltas + segment * 2);
      const rangeOffset = u16(view, rangeOffsets + segment * 2);
      if (rangeOffset === 0) return (code + delta) & 0xffff;
      const glyphAt = rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2;
      const gid = u16(view, glyphAt);
      return gid === 0 ? 0 : (gid + delta) & 0xffff;
    }
    return undefined;
  };
}

function format6(view: DataView, at: number): Lookup {
  const first = u16(view, at + 6);
  const count = u16(view, at + 8);
  return (code) =>
    code >= first && code < first + count ? u16(view, at + 10 + (code - first) * 2) : undefined;
}

function format12(view: DataView, at: number): Lookup {
  const groups = u32(view, at + 12);
  return (code) => {
    for (let group = 0; group < groups; group += 1) {
      const entry = at + 16 + group * 12;
      const start = u32(view, entry);
      const end = u32(view, entry + 4);
      if (code < start) return undefined;
      if (code <= end) return u32(view, entry + 8) + (code - start);
    }
    return undefined;
  };
}

const FORMATS: Record<number, (view: DataView, at: number) => Lookup> = {
  0: format0,
  4: format4,
  6: format6,
  12: format12,
};

interface CmapRecord {
  platform: number;
  encoding: number;
  lookup: Lookup;
}

function cmapRecords(view: DataView, tables: Map<string, Table>): CmapRecord[] {
  const cmap = tables.get('cmap');
  if (cmap === undefined) return [];
  const records: CmapRecord[] = [];
  const count = u16(view, cmap.offset + 2);
  for (let index = 0; index < count; index += 1) {
    const record = cmap.offset + 4 + index * 8;
    const subtable = cmap.offset + u32(view, record + 4);
    const parse = FORMATS[u16(view, subtable)];
    if (parse === undefined || subtable >= view.byteLength) continue;
    records.push({
      platform: u16(view, record),
      encoding: u16(view, record + 2),
      lookup: parse(view, subtable),
    });
  }
  return records;
}

function pick(records: CmapRecord[], wanted: (record: CmapRecord) => boolean): Lookup | null {
  return records.find(wanted)?.lookup ?? null;
}

/** Parses a TrueType program; null for CFF OpenType or anything unreadable. */
export function parseTrueType(bytes: Uint8Array): TrueTypeGlyphs | null {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = u32(view, 0);
  if (version !== 0x00010000 && tag(view, 0) !== 'true') return null;
  const tables = directory(view);
  const offsets = locaOffsets(view, tables);
  const records = cmapRecords(view, tables);
  const unicode =
    pick(records, (r) => r.platform === 3 && (r.encoding === 1 || r.encoding === 10)) ??
    pick(records, (r) => r.platform === 0);
  const symbol = pick(records, (r) => r.platform === 3 && r.encoding === 0);
  const mac = pick(records, (r) => r.platform === 1 && r.encoding === 0);
  return {
    numGlyphs: Math.max(0, offsets.length - 1),
    hasCmap: records.length > 0,
    hasOutline: (gid) => {
      const start = offsets[gid];
      const end = offsets[gid + 1];
      return start !== undefined && end !== undefined && end > start;
    },
    unicodeToGid: (codePoint) => unicode?.(codePoint),
    symbolToGid: (code) => symbol?.(code) ?? symbol?.(0xf000 | (code & 0xff)),
    macToGid: (code) => mac?.(code),
  };
}

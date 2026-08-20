/**
 * How wide is one glyph? Deleting text from a content stream needs the answer
 * twice: to know WHERE each glyph sits (so a whiteout box can be told what it
 * actually covers) and to know how far the pen moved (so the text left standing
 * beside it does not shift when the covered glyphs go).
 *
 * Widths come from the font's own dictionary wherever the file provides them
 * (`/Widths` for simple fonts, `/W` and `/DW` for Type0). The fourteen built-in
 * faces carry no width table at all — every reader is expected to know them —
 * so those are read out of pdf-lib's own copy of the Adobe metrics through a
 * throwaway document, which keeps the real file free of a font it never used.
 *
 * A face we cannot read at all falls back to a nominal half-em and says so:
 * `approximate` travels with the metrics so the caller can report the tradeoff
 * rather than quietly guess. Covered text that leaks is the dangerous failure;
 * a slightly wide estimate is the safe one.
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

/** Half an em — the nominal advance for a face whose widths cannot be read. */
export const FALLBACK_WIDTH = 500;
const FALLBACK_ASCENT = 750;
const FALLBACK_DESCENT = -220;

export interface GlyphMetrics {
  /** Bytes per character code: 1 for simple fonts, 2 for Type0. */
  codeBytes: 1 | 2;
  /** Glyph advance in 1/1000 of the text size. */
  widthOf(code: number): number;
  /** Top of the glyph box in 1/1000 of the text size. */
  ascent: number;
  /** Bottom of the glyph box in 1/1000 of the text size; negative. */
  descent: number;
  /** True when the widths are a nominal fallback rather than the face's own. */
  approximate: boolean;
}

const STANDARD_NAMES = new Set<string>(Object.values(StandardFonts));
const standardCache = new Map<string, Promise<PDFFont>>();

function embedStandard(name: string): Promise<PDFFont> {
  const known = standardCache.get(name);
  if (known !== undefined) return known;
  const embedding = PDFDocument.create({ updateMetadata: false }).then((scratch) =>
    scratch.embedFont(name as StandardFonts)
  );
  standardCache.set(name, embedding);
  return embedding;
}

function numberAt(dict: PDFDict | undefined, key: string): number | undefined {
  return dict?.lookupMaybe(PDFName.of(key), PDFNumber)?.asNumber();
}

function boxOf(descriptor: PDFDict | undefined): { ascent: number; descent: number } {
  return {
    ascent: numberAt(descriptor, 'Ascent') ?? FALLBACK_ASCENT,
    descent: numberAt(descriptor, 'Descent') ?? FALLBACK_DESCENT,
  };
}

/** `/Widths` indexed from `/FirstChar`, the shape every simple font uses. */
function simpleWidths(font: PDFDict): Map<number, number> | null {
  const widths = font.lookupMaybe(PDFName.of('Widths'), PDFArray);
  const first = numberAt(font, 'FirstChar');
  if (widths === undefined || first === undefined) return null;
  const table = new Map<number, number>();
  for (let index = 0; index < widths.size(); index += 1) {
    const width = widths.lookupMaybe(index, PDFNumber)?.asNumber();
    if (width !== undefined) table.set(first + index, width);
  }
  return table.size === 0 ? null : table;
}

/** `/W` is `c [w …]` runs and `cFirst cLast w` ranges, mixed freely. */
function cidWidths(descendant: PDFDict): Map<number, number> {
  const table = new Map<number, number>();
  const list = descendant.lookupMaybe(PDFName.of('W'), PDFArray);
  if (list === undefined) return table;
  let index = 0;
  while (index < list.size()) {
    const first = list.lookupMaybe(index, PDFNumber)?.asNumber();
    const second = list.lookup(index + 1);
    if (first === undefined || second === undefined) break;
    if (second instanceof PDFArray) {
      for (let step = 0; step < second.size(); step += 1) {
        const width = second.lookupMaybe(step, PDFNumber)?.asNumber();
        if (width !== undefined) table.set(first + step, width);
      }
      index += 2;
      continue;
    }
    index += fillRange(table, list, index, first);
  }
  return table;
}

function fillRange(
  table: Map<number, number>,
  list: PDFArray,
  index: number,
  first: number
): number {
  const last = list.lookupMaybe(index + 1, PDFNumber)?.asNumber();
  const width = list.lookupMaybe(index + 2, PDFNumber)?.asNumber();
  if (last === undefined || width === undefined) return list.size();
  for (let code = first; code <= last && code - first < 65536; code += 1) table.set(code, width);
  return 3;
}

function fromTable(
  table: Map<number, number>,
  fallback: number,
  codeBytes: 1 | 2,
  descriptor: PDFDict | undefined
): GlyphMetrics {
  return {
    codeBytes,
    widthOf: (code) => table.get(code) ?? fallback,
    ...boxOf(descriptor),
    approximate: false,
  };
}

async function type0Metrics(font: PDFDict): Promise<GlyphMetrics> {
  const descendants = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
  const descendant = descendants?.lookupMaybe(0, PDFDict);
  if (descendant === undefined) return approximate(2);
  const descriptor = descendant.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
  return fromTable(cidWidths(descendant), numberAt(descendant, 'DW') ?? 1000, 2, descriptor);
}

function approximate(codeBytes: 1 | 2): GlyphMetrics {
  return {
    codeBytes,
    widthOf: () => FALLBACK_WIDTH,
    ascent: FALLBACK_ASCENT,
    descent: FALLBACK_DESCENT,
    approximate: true,
  };
}

/** The built-in faces: no `/Widths` in the file, so read Adobe's own metrics. */
async function standardMetrics(baseFont: string): Promise<GlyphMetrics> {
  const font = await embedStandard(baseFont);
  const width = (code: number): number => {
    try {
      return font.widthOfTextAtSize(String.fromCharCode(code), 1000);
    } catch {
      return FALLBACK_WIDTH;
    }
  };
  const cache = new Map<number, number>();
  return {
    codeBytes: 1,
    widthOf: (code) => {
      const known = cache.get(code);
      if (known !== undefined) return known;
      const measured = width(code);
      cache.set(code, measured);
      return measured;
    },
    ascent: FALLBACK_ASCENT,
    descent: FALLBACK_DESCENT,
    approximate: false,
  };
}

async function metricsOf(font: PDFDict): Promise<GlyphMetrics> {
  if (font.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() === 'Type0') {
    return type0Metrics(font);
  }
  const descriptor = font.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
  const table = simpleWidths(font);
  if (table !== null) {
    return fromTable(table, numberAt(descriptor, 'MissingWidth') ?? 0, 1, descriptor);
  }
  const baseFont = font.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText() ?? '';
  const stripped = baseFont.includes('+') ? baseFont.slice(baseFont.indexOf('+') + 1) : baseFont;
  return STANDARD_NAMES.has(stripped) ? standardMetrics(stripped) : approximate(1);
}

/** Metrics for every font a resource dictionary names, keyed by its `/Fn` name. */
export async function fontMetricsOf(
  resources: PDFDict | undefined
): Promise<Map<string, GlyphMetrics>> {
  const fonts = new Map<string, GlyphMetrics>();
  const dictionary = resources?.lookupMaybe(PDFName.Font, PDFDict);
  if (dictionary === undefined) return fonts;
  for (const [key] of dictionary.entries()) {
    const font = dictionary.lookupMaybe(key, PDFDict);
    if (font !== undefined) fonts.set(key.decodeText(), await metricsOf(font));
  }
  return fonts;
}

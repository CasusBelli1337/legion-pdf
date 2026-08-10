/**
 * hOCR → word boxes. Tesseract is asked for hOCR (not TSV) because hOCR is the
 * only output that carries a per-word bounding box AND its confidence, which is
 * exactly what the invisible text layer needs.
 *
 * Written as a small tag-aware scanner rather than one big regex: `ocrx_word`
 * spans can legally contain nested markup, and a lazy `</span>` match would
 * truncate the word.
 */

import type { HocrPage, OcrWord, PixelBox } from './types';
import { HocrParseError } from './types';

const PAGE_ELEMENT = /<div[^>]*\bclass=['"]ocr_page['"][^>]*>/i;
const WORD_ELEMENT = /<span[^>]*\bclass=['"]ocrx_word['"][^>]*>/gi;
const TITLE_ATTRIBUTE = /\btitle=(?:'([^']*)'|"([^"]*)")/i;
const BBOX = /\bbbox\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/;
const CONFIDENCE = /\bx_wconf\s+(-?[\d.]+)/;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode the entity subset Tesseract emits, plus numeric references. */
export function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function titleOf(openTag: string): string {
  const match = TITLE_ATTRIBUTE.exec(openTag);
  return match?.[1] ?? match?.[2] ?? '';
}

function boxOf(title: string, what: string): PixelBox {
  const match = BBOX.exec(title);
  if (match === null) throw new HocrParseError(`${what} has no bbox in its hOCR title.`);
  return {
    x0: Number(match[1]),
    y0: Number(match[2]),
    x1: Number(match[3]),
    y1: Number(match[4]),
  };
}

/** Walk forward from the end of an opening `<span>` to its matching `</span>`. */
function innerHtmlOf(html: string, contentStart: number): { inner: string; end: number } {
  const open = /<span\b/gi;
  const close = /<\/span\s*>/gi;
  let depth = 1;
  let cursor = contentStart;
  while (depth > 0) {
    close.lastIndex = cursor;
    const closing = close.exec(html);
    if (closing === null) throw new HocrParseError('An ocrx_word span is never closed.');
    open.lastIndex = cursor;
    const opening = open.exec(html);
    if (opening !== null && opening.index < closing.index) {
      depth += 1;
      cursor = opening.index + opening[0].length;
      continue;
    }
    depth -= 1;
    cursor = closing.index + closing[0].length;
    if (depth === 0) {
      return { inner: html.slice(contentStart, closing.index), end: cursor };
    }
  }
  throw new HocrParseError('An ocrx_word span is never closed.');
}

/** Strip nested markup, decode entities, collapse runs of whitespace. */
export function wordTextOf(inner: string): string {
  return decodeEntities(inner.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function wordAt(
  html: string,
  openTag: string,
  contentStart: number
): { word: OcrWord | null; end: number } {
  const { inner, end } = innerHtmlOf(html, contentStart);
  const text = wordTextOf(inner);
  if (text.length === 0) return { word: null, end };
  const title = titleOf(openTag);
  const box = boxOf(title, `The word "${text}"`);
  if (box.x1 <= box.x0 || box.y1 <= box.y0) {
    throw new HocrParseError(
      `The word "${text}" has a collapsed bbox (${box.x0} ${box.y0} ${box.x1} ${box.y1}).`
    );
  }
  const confidence = CONFIDENCE.exec(title);
  return { word: { text, box, confidence: confidence === null ? 0 : Number(confidence[1]) }, end };
}

function pageSizeOf(hocr: string): { widthPx: number; heightPx: number } {
  const page = PAGE_ELEMENT.exec(hocr);
  if (page === null) throw new HocrParseError('The hOCR output contains no ocr_page element.');
  const box = boxOf(titleOf(page[0]), 'The page');
  return { widthPx: box.x1 - box.x0, heightPx: box.y1 - box.y0 };
}

/**
 * Parse one page of Tesseract hOCR. Throws rather than return a plausible-
 * looking empty page: a parse we cannot trust must never reach the writer.
 */
export function parseHocr(hocr: string): HocrPage {
  if (hocr.trim().length === 0) throw new HocrParseError('Tesseract returned no hOCR output.');
  const { widthPx, heightPx } = pageSizeOf(hocr);
  if (widthPx <= 0 || heightPx <= 0) {
    throw new HocrParseError(`The hOCR page bbox is empty (${widthPx} x ${heightPx} px).`);
  }
  const words: OcrWord[] = [];
  WORD_ELEMENT.lastIndex = 0;
  let match = WORD_ELEMENT.exec(hocr);
  while (match !== null) {
    const { word, end } = wordAt(hocr, match[0], match.index + match[0].length);
    if (word !== null) words.push(word);
    WORD_ELEMENT.lastIndex = end;
    match = WORD_ELEMENT.exec(hocr);
  }
  return { widthPx, heightPx, words };
}

/** Total characters of recognized text — the run receipt's per-page number. */
export function characterCount(words: readonly OcrWord[]): number {
  return words.reduce((total, word) => total + word.text.length, 0);
}

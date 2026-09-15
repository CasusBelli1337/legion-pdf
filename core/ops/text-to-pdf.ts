/**
 * Plain text onto paper — Letter, one-inch margins, wrapped and paginated.
 *
 * This is the fallback that runs when Microsoft Word is not installed, so it has
 * to be boring and right rather than clever: no styling to guess at, a
 * monospaced default so a log or an exported table keeps its columns, and a hard
 * wrap so nothing runs off the right edge where nobody would see it.
 *
 * The built-in PDF fonts speak WinAnsi only. A character outside it (an emoji, a
 * Chinese name) is replaced with "?" and COUNTED in the result, because refusing
 * to open the whole file over one stray glyph would be worse — and a silent
 * substitution nobody could count would be worse still.
 */

import { StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import type { OpResult } from '@shared/types';
import { createPdf, finish } from './pdf-io';

export interface TextPdfOptions {
  /** Courier keeps columns lined up; Times reads like a letter. Default Courier. */
  font?: 'courier' | 'times';
  /** Point size. Default 11. */
  size?: number;
}

export interface TextPdfDetail {
  /** Lines actually drawn, after wrapping — countable proof nothing was dropped. */
  lines: number;
  /** Characters the built-in PDF fonts cannot print, replaced with "?". */
  unprintable: number;
}

const PAGE = { width: 612, height: 792 };
const MARGIN = 72;
const LEADING_RATIO = 1.35;
const TAB_WIDTH = 4;
const DEFAULT_SIZE = 11;

const FACES = { courier: StandardFonts.Courier, times: StandardFonts.TimesRoman } as const;

/**
 * Replaces what the built-in faces cannot draw, and says how often it had to.
 * Runs per LINE, after the text has been split: a newline is not a glyph, and
 * asking the font to encode one would turn the whole file into a single "?"-
 * separated paragraph that never paginates.
 */
function sanitize(
  text: string,
  font: PDFFont,
  known: Map<string, boolean>
): { text: string; unprintable: number } {
  let unprintable = 0;
  let out = '';
  for (const character of text) {
    let printable = known.get(character);
    if (printable === undefined) {
      try {
        font.encodeText(character);
        printable = true;
      } catch {
        printable = false;
      }
      known.set(character, printable);
    }
    if (printable) out += character;
    else {
      out += '?';
      unprintable += 1;
    }
  }
  return { text: out, unprintable };
}

/** A word longer than the column is broken by character rather than overflowing. */
function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const character of word) {
    if (piece !== '' && font.widthOfTextAtSize(piece + character, size) > maxWidth) {
      pieces.push(piece);
      piece = '';
    }
    piece += character;
  }
  if (piece !== '') pieces.push(piece);
  return pieces;
}

/** One source line, wrapped on spaces to the column width. Never returns empty. */
function wrapLine(line: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = line.split(' ');
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      out.push(current);
      current = '';
    }
    const pieces = splitLongWord(current === '' ? word : candidate, font, size, maxWidth);
    current = pieces.pop() ?? '';
    out.push(...pieces);
  }
  out.push(current);
  return out;
}

/** Source lines, tabs expanded, form feeds kept as the page breaks they are. */
function sourceLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\t/g, ' '.repeat(TAB_WIDTH)).split('\n');
}

const PAGE_BREAK = '\f';

/**
 * Letter pages of wrapped text. `pagesIn` is 1: one text document went in, and
 * however many pages it took came out, which the caller can check against
 * `detail.lines`.
 */
export async function textToPdf(
  text: string,
  options: TextPdfOptions = {}
): Promise<OpResult<TextPdfDetail>> {
  const size = options.size ?? DEFAULT_SIZE;
  const document = await createPdf();
  const font = await document.embedFont(FACES[options.font ?? 'courier']);
  const leading = size * LEADING_RATIO;
  const perPage = Math.max(1, Math.floor((PAGE.height - MARGIN * 2) / leading));
  const maxWidth = PAGE.width - MARGIN * 2;
  const known = new Map<string, boolean>();

  let page = document.addPage([PAGE.width, PAGE.height]);
  let row = 0;
  const detail: TextPdfDetail = { lines: 0, unprintable: 0 };
  for (const source of sourceLines(text)) {
    if (source === PAGE_BREAK) {
      page = document.addPage([PAGE.width, PAGE.height]);
      row = 0;
      continue;
    }
    const clean = sanitize(source.replaceAll(PAGE_BREAK, ' '), font, known);
    detail.unprintable += clean.unprintable;
    for (const line of wrapLine(clean.text, font, size, maxWidth)) {
      if (row >= perPage) {
        page = document.addPage([PAGE.width, PAGE.height]);
        row = 0;
      }
      page.drawText(line, { x: MARGIN, y: PAGE.height - MARGIN - leading * (row + 1), size, font });
      row += 1;
      detail.lines += 1;
    }
  }
  return finish(document, 1, document.getPageCount(), detail, 'text PDF');
}

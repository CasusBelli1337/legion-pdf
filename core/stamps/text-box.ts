/**
 * F-10 "add text". Click anywhere, type, apply — the text becomes page content
 * immediately, so it prints and extracts like the rest of the document.
 *
 * `at` is where the attorney clicked: the bottom-left of the FIRST line as the
 * page is displayed. Later lines stack downward from there, the way a cursor
 * moves, and wrapping at `maxWidthPt` breaks on spaces.
 */

import type { OpResult, TextBoxOptions } from '@shared/types';
import { finish, loadPdf } from '../ops/pdf-io';
import { parseHexColor } from './color';
import { toVisualSpace } from './geometry';
import { drawText, embedFont, measureText, pageFrame, BODY_FONT } from './ink';
import type { PDFFont } from 'pdf-lib';

const MAX_CHARACTERS = 8000;
/** Line spacing as a multiple of the font's own height. */
const LINE_SPACING = 1.15;

function assertOptions(options: TextBoxOptions, pageCount: number): void {
  if (options.text.trim().length === 0) {
    throw new RangeError('There is no text to add — type something first.');
  }
  if (options.text.length > MAX_CHARACTERS) {
    throw new RangeError(`A text box holds at most ${MAX_CHARACTERS} characters.`);
  }
  if (!Number.isInteger(options.page) || options.page < 1 || options.page > pageCount) {
    throw new RangeError(
      `This document has pages 1 through ${pageCount}; there is no page ${options.page}.`
    );
  }
  if (!(options.fontSize > 0)) throw new RangeError('The text size must be above zero.');
  if (options.maxWidthPt !== undefined && !(options.maxWidthPt > 0)) {
    throw new RangeError('The wrapping width must be above zero.');
  }
}

function wrapWords(words: string[], font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (current.length > 0 && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** The lines this text becomes at this size — hard breaks first, then wrapping. */
export function layoutLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth?: number
): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  if (maxWidth === undefined) return paragraphs;
  return paragraphs.flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    return words.length === 0 ? [''] : wrapWords(words, font, size, maxWidth);
  });
}

export async function addTextBox(bytes: Uint8Array, options: TextBoxOptions): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  assertOptions(options, pagesIn);

  const page = document.getPage(options.page - 1);
  const frame = pageFrame(page);
  const font = await embedFont(document, BODY_FONT);
  const color = parseHexColor(options.color, 'text colour');
  const start = toVisualSpace(frame, options.at);
  const step = measureText(font, 'Hg', options.fontSize).height * LINE_SPACING;

  layoutLines(options.text, font, options.fontSize, options.maxWidthPt).forEach((line, index) => {
    if (line.length === 0) return;
    drawText(page, frame, {
      text: line,
      font,
      size: options.fontSize,
      color,
      at: { x: start.x, y: start.y - index * step },
    });
  });

  return finish(document, pagesIn, pagesIn, undefined, 'document with added text');
}

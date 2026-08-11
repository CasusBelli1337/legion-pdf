/**
 * F-4 slip sheets. A standalone divider page carrying the exhibit label,
 * inserted ahead of the page the attorney picked.
 *
 * The sheet copies the size the neighbouring page is DISPLAYED at, so a slip
 * sheet in front of a landscape scan is landscape too, and it carries no
 * rotation of its own — the label is drawn straight onto an upright sheet.
 */

import type { OpResult, PageSize, SlipSheetOptions } from '@shared/types';
import { finish, loadPdf } from '../ops/pdf-io';
import { BLACK } from './color';
import { frameOf } from './geometry';
import { drawText, embedFont, measureText, pageFrame, STAMP_FONT } from './ink';

const LABEL_SIZE = 36;
const MAX_LABEL = 64;
/** Shrink the label until it fits the sheet with this much clear on each side. */
const SIDE_MARGIN = 54;

function assertOptions(options: SlipSheetOptions, pageCount: number): void {
  if (options.label.trim().length === 0) {
    throw new RangeError('A slip sheet needs a label, for example "Exhibit A".');
  }
  if (options.label.length > MAX_LABEL) {
    throw new RangeError(`A slip-sheet label is at most ${MAX_LABEL} characters.`);
  }
  if (!Number.isInteger(options.atPage) || options.atPage < 1 || options.atPage > pageCount + 1) {
    throw new RangeError(
      `A slip sheet goes in at position 1 through ${pageCount + 1}, not ${options.atPage}.`
    );
  }
}

/** The displayed size of the page the sheet lands in front of (or behind, at the end). */
function neighbourSize(sizes: readonly PageSize[], index: number): PageSize {
  const size = sizes[index] ?? sizes[sizes.length - 1];
  if (size === undefined) throw new Error('The document has no page to match the size of.');
  return size;
}

export async function insertSlipSheet(
  bytes: Uint8Array,
  options: SlipSheetOptions
): Promise<OpResult> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  assertOptions(options, pagesIn);

  const sizes = document.getPages().map((page) => pageFrame(page).visual);
  const size = neighbourSize(sizes, options.atPage - 1);
  const font = await embedFont(document, STAMP_FONT);
  const label = options.label.trim();

  const sheet = document.insertPage(options.atPage - 1, [size.width, size.height]);
  const frame = frameOf(size, 0);
  const fontSize = fittedSize(font.widthOfTextAtSize(label, LABEL_SIZE), size.width);
  const text = measureText(font, label, fontSize);
  drawText(sheet, frame, {
    text: label,
    font,
    size: fontSize,
    color: BLACK,
    at: { x: (size.width - text.width) / 2, y: (size.height - text.height) / 2 },
  });

  return finish(document, pagesIn, pagesIn + 1, undefined, 'document with a slip sheet');
}

function fittedSize(widthAtFullSize: number, pageWidth: number): number {
  const usable = Math.max(1, pageWidth - 2 * SIDE_MARGIN);
  if (widthAtFullSize <= usable) return LABEL_SIZE;
  return Math.max(8, (LABEL_SIZE * usable) / widthAtFullSize);
}

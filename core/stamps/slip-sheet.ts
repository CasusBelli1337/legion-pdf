/**
 * F-4 slip sheets. A standalone divider page carrying the exhibit label,
 * inserted ahead of the page the attorney picked.
 *
 * The sheet copies the size the neighbouring page is DISPLAYED at, so a slip
 * sheet in front of a landscape scan is landscape too, and it carries no
 * rotation of its own — the label is drawn straight onto an upright sheet.
 *
 * Size, border, and placement are the attorney's: the label is drawn with the
 * very same box the exhibit stamp uses (./label-box), so a bordered stamp and
 * its divider page match. Omitting all three draws the sheet exactly as it has
 * always been drawn — a plain 36pt label in the middle of the paper.
 */

import type { PDFFont } from 'pdf-lib';
import type {
  OpResult,
  PageSize,
  PdfPoint,
  SlipSheetOptions,
  SlipSheetPosition,
} from '@shared/types';
import { finish, loadPdf } from '../ops/pdf-io';
import { frameOf, stampAnchor, type BoxSize } from './geometry';
import { embedFont, pageFrame, STAMP_FONT } from './ink';
import { drawLabel, measureLabel, LABEL_PADDING, type LabelMetrics } from './label-box';

const LABEL_SIZE = 36;
const MAX_LABEL = 64;
/** Shrink the label until it fits the sheet with this much clear on each side. */
const SIDE_MARGIN = 54;
/**
 * Inset for a label parked in a corner or on the bottom edge. A slip sheet has
 * no margin of its own to set — it is a page this app made — so it uses the
 * same three-quarter inch the fitting margin uses.
 */
const SHEET_MARGIN = SIDE_MARGIN;

function assertOptions(options: SlipSheetOptions, pageCount: number): void {
  if (options.label.trim().length === 0) {
    throw new RangeError('A slip sheet needs a label, for example "Exhibit A".');
  }
  if (options.label.length > MAX_LABEL) {
    throw new RangeError(`A slip-sheet label is at most ${MAX_LABEL} characters.`);
  }
  if (options.fontSize !== undefined && !(options.fontSize > 0)) {
    throw new RangeError('The slip-sheet text size must be above zero.');
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

/**
 * The size the label is actually drawn at: what was asked for, shrunk until the
 * whole box — border padding included — clears both edges of the sheet.
 */
function fittedSize(
  font: PDFFont,
  label: string,
  asked: number,
  sheet: PageSize,
  pad: number
): number {
  const usable = Math.max(1, sheet.width - 2 * SIDE_MARGIN - 2 * pad);
  const width = font.widthOfTextAtSize(label, asked);
  if (width <= usable) return asked;
  return Math.max(8, (asked * usable) / width);
}

/** Visual bottom-left of the label box: the middle of the sheet, or any stamp corner. */
function sheetAnchor(position: SlipSheetPosition, sheet: PageSize, box: BoxSize): PdfPoint {
  if (position === 'center') {
    return { x: (sheet.width - box.width) / 2, y: (sheet.height - box.height) / 2 };
  }
  return stampAnchor(position, sheet, box, SHEET_MARGIN);
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
  const bordered = options.bordered ?? false;

  const sheet = document.insertPage(options.atPage - 1, [size.width, size.height]);
  const frame = frameOf(size, 0);
  const fontSize = fittedSize(
    font,
    label,
    options.fontSize ?? LABEL_SIZE,
    size,
    bordered ? LABEL_PADDING : 0
  );
  const metrics: LabelMetrics = measureLabel(font, label, fontSize, bordered);

  drawLabel(sheet, frame, {
    text: label,
    font,
    size: fontSize,
    bordered,
    metrics,
    at: sheetAnchor(options.position ?? 'center', size, metrics.box),
    label: 'slip-sheet label',
  });

  return finish(document, pagesIn, pagesIn + 1, undefined, 'document with a slip sheet');
}

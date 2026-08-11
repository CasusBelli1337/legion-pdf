/**
 * F-3 Bates numbering. One continuous production number per page, burned into
 * the page content so no reader can lift it back off.
 *
 * The returned detail lists the exact string put on every page, in page order.
 * That list is the evidence the acceptance test extracts text against, and it
 * is what the panel shows the attorney as a receipt — a Bates run that quietly
 * skipped a page would otherwise look identical to one that did not.
 */

import type { BatesDetail, BatesOptions, OpResult } from '@shared/types';
import { normalizePages } from '../ops/page-selection';
import { finish, loadPdf, type ProgressReporter } from '../ops/pdf-io';
import { BLACK, WHITE } from './color';
import { cornerAnchor } from './geometry';
import { drawRect, drawText, embedFont, measureText, pageFrame, STAMP_FONT } from './ink';

const MAX_PAD_WIDTH = 12;
const MAX_PREFIX = 32;
/** Padding around the number inside its white backing box, in points. */
const BOX_PADDING = 3;

/** The exact string page `index` of the run carries. Pure — the panel previews with it. */
export function batesLabel(options: BatesOptions, index: number): string {
  const number = options.startNumber + index;
  return `${options.prefix}${String(number).padStart(options.padWidth, '0')}`;
}

function assertOptions(options: BatesOptions): void {
  if (!Number.isInteger(options.startNumber) || options.startNumber < 0) {
    throw new RangeError(
      `Bates numbering starts at a whole number of 0 or more, not ${options.startNumber}.`
    );
  }
  if (!Number.isInteger(options.padWidth) || options.padWidth < 0) {
    throw new RangeError(`Zero-padding is a whole number of digits, not ${options.padWidth}.`);
  }
  if (options.padWidth > MAX_PAD_WIDTH) {
    throw new RangeError(`Bates numbers pad to at most ${MAX_PAD_WIDTH} digits.`);
  }
  if (options.prefix.length > MAX_PREFIX) {
    throw new RangeError(`A Bates prefix is at most ${MAX_PREFIX} characters.`);
  }
  if (!(options.fontSize > 0) || !(options.margin >= 0)) {
    throw new RangeError(
      'The Bates font size must be above zero and the margin cannot be negative.'
    );
  }
}

export async function applyBates(
  bytes: Uint8Array,
  options: BatesOptions,
  onProgress?: ProgressReporter
): Promise<OpResult<BatesDetail>> {
  assertOptions(options);
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const pages = normalizePages(options.pages, pagesIn, 'pages to number');
  const font = await embedFont(document, STAMP_FONT);

  const batesApplied: string[] = [];
  pages.forEach((pageNumber, index) => {
    const label = batesLabel(options, index);
    const page = document.getPage(pageNumber - 1);
    const frame = pageFrame(page);
    const text = measureText(font, label, options.fontSize);
    const at = cornerAnchor(options.position, frame.visual, text, options.margin);

    if (options.whiteBackingBox) {
      drawRect(page, frame, {
        at: { x: at.x - BOX_PADDING, y: at.y - BOX_PADDING },
        size: { width: text.width + 2 * BOX_PADDING, height: text.height + 2 * BOX_PADDING },
        fill: WHITE,
      });
    }
    drawText(page, frame, { text: label, font, size: options.fontSize, color: BLACK, at });

    batesApplied.push(label);
    onProgress?.(index + 1, pages.length);
  });

  return finish(document, pagesIn, pagesIn, { batesApplied }, 'Bates-numbered document');
}

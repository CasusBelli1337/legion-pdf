/**
 * F-5 page numbering — "Page 3 of 12" in a header or footer. Deliberately
 * separate from Bates: a brief gets page numbers, a production gets Bates
 * numbers, and the two run on different schemes in the same document.
 *
 * {total} is the LAST number the run assigns, not the document's page count.
 * Numbering the whole document from 1 makes those the same thing; numbering a
 * ten-page excerpt from 1 gives "Page 3 of 10", which is what the reader of the
 * excerpt needs to see.
 */

import type { OpResult, PageNumberDetail, PageNumberOptions } from '@shared/types';
import { normalizePages } from '../ops/page-selection';
import { finish, loadPdf, type ProgressReporter } from '../ops/pdf-io';
import { BLACK } from './color';
import { bandAnchor } from './geometry';
import { drawText, embedFont, measureText, pageFrame, BODY_FONT } from './ink';

const MAX_TEMPLATE = 64;

/** The exact string for one page of the run. Pure — the panel previews with it. */
export function pageNumberLabel(template: string, current: number, total: number): string {
  return template.replaceAll('{n}', String(current)).replaceAll('{total}', String(total));
}

function assertOptions(options: PageNumberOptions): void {
  if (options.template.trim().length === 0) {
    throw new RangeError('Page numbering needs a pattern, for example "Page {n} of {total}".');
  }
  if (options.template.length > MAX_TEMPLATE) {
    throw new RangeError(`A page-number pattern is at most ${MAX_TEMPLATE} characters.`);
  }
  if (!Number.isInteger(options.startNumber) || options.startNumber < 0) {
    throw new RangeError(
      `Page numbering starts at a whole number of 0 or more, not ${options.startNumber}.`
    );
  }
  if (!(options.fontSize > 0) || !(options.margin >= 0)) {
    throw new RangeError(
      'The page-number font size must be above zero and the margin cannot be negative.'
    );
  }
}

export async function applyPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions,
  onProgress?: ProgressReporter
): Promise<OpResult<PageNumberDetail>> {
  assertOptions(options);
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const pages = normalizePages(options.pages, pagesIn, 'pages to number');
  const font = await embedFont(document, BODY_FONT);
  const total = options.startNumber + pages.length - 1;

  const numbersApplied: string[] = [];
  pages.forEach((pageNumber, index) => {
    const label = pageNumberLabel(options.template, options.startNumber + index, total);
    const page = document.getPage(pageNumber - 1);
    const frame = pageFrame(page);
    const box = measureText(font, label, options.fontSize);
    drawText(page, frame, {
      text: label,
      font,
      size: options.fontSize,
      color: BLACK,
      at: bandAnchor(options.placement, options.alignment, frame.visual, box, options.margin),
    });
    numbersApplied.push(label);
    onProgress?.(index + 1, pages.length);
  });

  return finish(document, pagesIn, pagesIn, { numbersApplied }, 'page-numbered document');
}

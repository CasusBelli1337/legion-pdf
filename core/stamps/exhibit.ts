/**
 * F-4 exhibit stamps. The classic bordered box a litigator drops on the first
 * page of an exhibit: white backing so it reads over whatever is underneath,
 * a hairline black border, bold label inside.
 *
 * Like Bates, this paints into the page content stream — the stamp is part of
 * the page the moment it is applied, not an annotation opposing counsel's
 * reader will offer to delete.
 */

import type { ExhibitDetail, ExhibitOptions, OpResult } from '@shared/types';
import { normalizePages } from '../ops/page-selection';
import { finish, loadPdf, type ProgressReporter } from '../ops/pdf-io';
import { BLACK, WHITE } from './color';
import { stampAnchor, type BoxSize } from './geometry';
import { drawRect, drawText, embedFont, measureText, pageFrame, STAMP_FONT } from './ink';

/** Breathing room between the label and its border, in points. */
const PADDING = 8;
const BORDER_WIDTH = 1.5;
const MAX_LABEL = 64;

function assertOptions(options: ExhibitOptions): void {
  if (options.label.trim().length === 0) {
    throw new RangeError('An exhibit stamp needs a label, for example "EXHIBIT A".');
  }
  if (options.label.length > MAX_LABEL) {
    throw new RangeError(`An exhibit label is at most ${MAX_LABEL} characters.`);
  }
  if (!(options.fontSize > 0) || !(options.margin >= 0)) {
    throw new RangeError(
      'The exhibit font size must be above zero and the margin cannot be negative.'
    );
  }
}

function stampSize(text: BoxSize, bordered: boolean): BoxSize {
  if (!bordered) return text;
  return { width: text.width + 2 * PADDING, height: text.height + 2 * PADDING };
}

export async function applyExhibitStamp(
  bytes: Uint8Array,
  options: ExhibitOptions,
  onProgress?: ProgressReporter
): Promise<OpResult<ExhibitDetail>> {
  assertOptions(options);
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const pages = normalizePages(options.pages, pagesIn, 'pages to stamp');
  const font = await embedFont(document, STAMP_FONT);
  const label = options.label.trim();

  const labelsApplied: string[] = [];
  pages.forEach((pageNumber, index) => {
    const page = document.getPage(pageNumber - 1);
    const frame = pageFrame(page);
    const text = measureText(font, label, options.fontSize);
    const box = stampSize(text, options.bordered);
    const at = stampAnchor(options.position, frame.visual, box, options.margin);

    if (options.bordered) {
      drawRect(page, frame, {
        at,
        size: box,
        fill: WHITE,
        border: BLACK,
        borderWidth: BORDER_WIDTH,
      });
    }
    drawText(page, frame, {
      text: label,
      font,
      size: options.fontSize,
      color: BLACK,
      at: options.bordered ? { x: at.x + PADDING, y: at.y + PADDING } : at,
    });

    labelsApplied.push(label);
    onProgress?.(index + 1, pages.length);
  });

  return finish(document, pagesIn, pagesIn, { labelsApplied }, 'exhibit-stamped document');
}

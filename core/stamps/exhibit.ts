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
import { stampAnchor } from './geometry';
import { embedFont, pageFrame, STAMP_FONT } from './ink';
import { drawLabel, measureLabel } from './label-box';

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
    const metrics = measureLabel(font, label, options.fontSize, options.bordered);
    const at = stampAnchor(options.position, frame.visual, metrics.box, options.margin);

    drawLabel(page, frame, {
      text: label,
      font,
      size: options.fontSize,
      bordered: options.bordered,
      metrics,
      at,
      label: 'exhibit label',
    });

    labelsApplied.push(label);
    onProgress?.(index + 1, pages.length);
  });

  return finish(document, pagesIn, pagesIn, { labelsApplied }, 'exhibit-stamped document');
}

/**
 * Rotate pages. `degrees` is added CLOCKWISE to whatever rotation the page
 * already carries, so 270 is the counter-clockwise button and rotating a page
 * that arrived at 90° never resets it to zero.
 */

import { degrees } from 'pdf-lib';
import type { OpResult, RotateOptions } from '@shared/types';
import { normalizePages } from './page-selection';
import { finish, loadPdf, type ProgressReporter } from './pdf-io';

const ALLOWED_DEGREES = [90, 180, 270];

/** PDF /Rotate must be a multiple of 90 in 0..270; readers reject anything else. */
function normalizeAngle(angle: number): number {
  return (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
}

export async function rotatePages(
  bytes: Uint8Array,
  options: RotateOptions,
  onProgress?: ProgressReporter
): Promise<OpResult> {
  if (!ALLOWED_DEGREES.includes(options.degrees)) {
    throw new RangeError(`Pages turn in quarter turns — ${options.degrees}° is not one of them.`);
  }
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const pages = normalizePages(options.pages, pagesIn, 'pages to rotate');

  pages.forEach((pageNumber, index) => {
    const page = document.getPage(pageNumber - 1);
    page.setRotation(degrees(normalizeAngle(page.getRotation().angle + options.degrees)));
    onProgress?.(index + 1, pages.length);
  });

  return finish(document, pagesIn, pagesIn, undefined, 'rotated document');
}

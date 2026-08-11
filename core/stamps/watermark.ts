/**
 * F-5 watermarks. DRAFT, CONFIDENTIAL, ATTORNEY WORK PRODUCT — set across the
 * middle of the page, diagonal or level, translucent enough to read through.
 *
 * Transparency is a real graphics state (an /ExtGState with a `ca` value), not
 * a pale grey pretending to be one, so the page underneath stays legible in
 * print as well as on screen.
 */

import type { OpResult, WatermarkOptions } from '@shared/types';
import { watermarkAnchor, watermarkSpin } from '@shared/watermark-placement';
import { normalizePages } from '../ops/page-selection';
import { finish, loadPdf, type ProgressReporter } from '../ops/pdf-io';
import { parseHexColor } from './color';
import { drawText, embedFont, measureText, pageFrame, STAMP_FONT } from './ink';

const MAX_TEXT = 64;

function assertOptions(options: WatermarkOptions): void {
  if (options.text.trim().length === 0) {
    throw new RangeError('A watermark needs some text, for example "DRAFT".');
  }
  if (options.text.length > MAX_TEXT) {
    throw new RangeError(`Watermark text is at most ${MAX_TEXT} characters.`);
  }
  if (!(options.fontSize > 0)) {
    throw new RangeError('The watermark font size must be above zero.');
  }
  if (!(options.opacity > 0) || options.opacity > 1) {
    throw new RangeError(
      `Watermark strength runs from just above 0 to 1; ${options.opacity} would be invisible or opaque.`
    );
  }
}

export async function applyWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions,
  onProgress?: ProgressReporter
): Promise<OpResult> {
  assertOptions(options);
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  const pages = normalizePages(options.pages, pagesIn, 'pages to watermark');
  const font = await embedFont(document, STAMP_FONT);
  const color = parseHexColor(options.color, 'watermark colour');
  const spin = watermarkSpin(options.orientation);
  const text = options.text.trim();

  pages.forEach((pageNumber, index) => {
    const page = document.getPage(pageNumber - 1);
    const frame = pageFrame(page);
    const box = measureText(font, text, options.fontSize);
    drawText(page, frame, {
      text,
      font,
      size: options.fontSize,
      color,
      spin,
      opacity: options.opacity,
      at: watermarkAnchor(frame.visual, box, spin),
    });
    onProgress?.(index + 1, pages.length);
  });

  return finish(document, pagesIn, pagesIn, undefined, 'watermarked document');
}

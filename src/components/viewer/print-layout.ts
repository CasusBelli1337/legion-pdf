/**
 * The two decisions printing makes about PAPER, kept pure so they can be
 * tested: what size sheet the document is printed on, and whether the attorney
 * needs telling that its pages are not all one size.
 *
 * WHY the `@page` rule exists at all. `size: auto` leaves the paper to
 * Chromium, and when its guess is a hair shorter than the page image — printer
 * hardware margins, a Legal page on Letter paper, a rounded raster — the image
 * overflows onto a second, near-blank sheet. Every page then costs two sheets,
 * which is what turned a 15-page print into 30. Naming the size takes the guess
 * out of it; the one-sheet page boxes in `print.css` do the rest.
 */

/** A page box in PDF points — a pdfjs viewport at scale 1, with /Rotate applied. */
export interface PrintPageSize {
  width: number;
  height: number;
}

/** The id of the <style> element the controller injects and removes. */
export const PAGE_STYLE_ID = 'librarius-print-page-size';

/** Half a point: below this, two page boxes are the same paper. */
const SAME_SIZE_TOLERANCE = 0.5;

function pointsOf(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Page 1 of this document has no printable ${label}, so it cannot be printed.`);
  }
  return Math.round(value * 100) / 100;
}

/** The `@page` rule for a document whose first page is `size`. */
export function pageSizeRule(size: PrintPageSize): string {
  const width = pointsOf(size.width, 'width');
  const height = pointsOf(size.height, 'height');
  return `@page { size: ${width}pt ${height}pt; margin: 0; }`;
}

function inches(points: number): string {
  return String(Math.round((points / 72) * 100) / 100);
}

/** "8.5 × 14 in" — paper the way an attorney says it, not in points. */
export function describePaper(size: PrintPageSize): string {
  return `${inches(size.width)} × ${inches(size.height)} in`;
}

function sameSize(a: PrintPageSize, b: PrintPageSize): boolean {
  return (
    Math.abs(a.width - b.width) < SAME_SIZE_TOLERANCE &&
    Math.abs(a.height - b.height) < SAME_SIZE_TOLERANCE
  );
}

/**
 * Plain English when a document mixes paper sizes, null when it does not. One
 * print job is one paper size, so a Legal exhibit inside a Letter brief is
 * scaled down to fit rather than silently cropped — worth saying out loud.
 */
export function mixedSizeNotice(sizes: readonly PrintPageSize[]): string | null {
  const first = sizes[0];
  if (first === undefined) return null;
  if (sizes.every((size) => sameSize(size, first))) return null;
  // Short on purpose: the status footer truncates, and there is no tooltip.
  return `Pages are not all one size — every sheet prints at ${describePaper(first)}.`;
}

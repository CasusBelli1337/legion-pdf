/**
 * A page's box need not start at zero. A scanner that crops a landscape
 * envelope out of a portrait sheet writes a MediaBox of [0 180 792 792]: every
 * coordinate on the page is then 180 points above where the paper says it is.
 * Everything downstream measures from the page's own lower-left corner, so the
 * box's origin is taken off once, here — left in, the envelope's words were
 * all read as sitting in the top margin and landed 50 points up the Word page.
 */

import type { LayoutCheckbox, LayoutImage, LayoutRule, LayoutTextRun } from '@shared/types';

export interface PageOrigin {
  x: number;
  y: number;
}

/** The lower-left corner of a pdfjs `view` ([x0, y0, x1, y1]). */
export function originOf(view: readonly number[] | undefined): PageOrigin {
  if (view === undefined) return { x: 0, y: 0 };
  return { x: view[0] ?? 0, y: view[1] ?? 0 };
}

export function atOrigin(origin: PageOrigin): boolean {
  return origin.x === 0 && origin.y === 0;
}

/** A text item's transform with the page box's origin taken off its position. */
export function transformFromOrigin(transform: readonly number[], origin: PageOrigin): number[] {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = transform;
  return [a, b, c, d, e - origin.x, f - origin.y];
}

export interface PageMarks {
  runs: LayoutTextRun[];
  images: LayoutImage[];
  rules: LayoutRule[];
}

/** The page's runs, pictures, and rules measured from the page's own corner. */
export function fromOrigin(marks: PageMarks, origin: PageOrigin): PageMarks {
  if (atOrigin(origin)) return marks;
  const moved = <T extends { x: number; y: number }>(rect: T): T => ({
    ...rect,
    x: rect.x - origin.x,
    y: rect.y - origin.y,
  });
  return {
    runs: marks.runs.map(moved),
    images: marks.images.map((image) => ({ ...image, rect: moved(image.rect) })),
    rules: marks.rules.map((rule) => ({ ...rule, rect: moved(rule.rect) })),
  };
}

/** Drawn checkboxes measured from the page's own corner. */
export function boxesFromOrigin(
  boxes: readonly LayoutCheckbox[],
  origin: PageOrigin
): LayoutCheckbox[] {
  return boxes.map((box) => ({
    ...box,
    rect: { ...box.rect, x: box.rect.x - origin.x, y: box.rect.y - origin.y },
  }));
}

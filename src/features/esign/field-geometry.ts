/**
 * House geometry for e-sign fields: the box each kind starts life as, and the
 * bounds a drag-resize may take it to. Sizes are PDF points, chosen to sit
 * comfortably on a signature line of a US-letter court or corporate document.
 */

import type { EsignFieldKind, PdfPoint, PdfRect } from '@shared/types';

/** Default box per kind, bottom-left anchored at the click point. */
export const FIELD_SIZES: Record<EsignFieldKind, { width: number; height: number }> = {
  signature: { width: 180, height: 40 },
  initials: { width: 64, height: 32 },
  name: { width: 170, height: 20 },
  date: { width: 100, height: 20 },
  text: { width: 170, height: 20 },
};

export const MIN_FIELD_SIZE = { width: 36, height: 12 };
export const MAX_FIELD_SIZE = { width: 480, height: 160 };

/** What the empty box says on the page and in the signing UI. */
export const FIELD_TITLES: Record<EsignFieldKind, string> = {
  signature: 'Signature',
  initials: 'Initials',
  name: 'Name',
  date: 'Date',
  text: 'Text',
};

/** The default box for a kind, centred on where the attorney clicked. */
export function rectAt(kind: EsignFieldKind, at: PdfPoint): PdfRect {
  const size = FIELD_SIZES[kind];
  return {
    x: at.x - size.width / 2,
    y: at.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/** A resize clamped to sane bounds so a field can never vanish or swallow a page. */
export function clampRect(rect: PdfRect): PdfRect {
  return {
    ...rect,
    width: Math.min(Math.max(rect.width, MIN_FIELD_SIZE.width), MAX_FIELD_SIZE.width),
    height: Math.min(Math.max(rect.height, MIN_FIELD_SIZE.height), MAX_FIELD_SIZE.height),
  };
}

/**
 * The sizing arithmetic behind a placed signature.
 *
 * A signature is only ever resized by its HEIGHT: the width follows from the
 * image's own aspect ratio, so a scanned signature can never be stretched into
 * something the attorney did not sign. Kept pure and free of React so the
 * clamping is unit-tested rather than trusted.
 */

import type { PdfPoint, SignatureAsset } from '@shared/types';

/**
 * Height a freshly placed signature starts at, in PDF points — a shade under an
 * inch, which is what a signature block on a pleading actually measures. The
 * old 42pt landed them "very small" (the owner's word), so every placement
 * began with a resize.
 */
export const DEFAULT_SIGNATURE_HEIGHT = 68;
export const MIN_SIGNATURE_HEIGHT = 8;
export const MAX_SIGNATURE_HEIGHT = 400;

export interface PlacedSize {
  widthPt: number;
  heightPt: number;
}

/** Width over height. A signature with no recorded height is treated as 3:1. */
export function aspectOf(signature: SignatureAsset): number {
  return signature.heightPx === 0 ? 3 : signature.widthPx / signature.heightPx;
}

export function clampHeight(heightPt: number): number {
  if (!Number.isFinite(heightPt)) return DEFAULT_SIGNATURE_HEIGHT;
  return Math.min(MAX_SIGNATURE_HEIGHT, Math.max(MIN_SIGNATURE_HEIGHT, heightPt));
}

/** The box a signature occupies at a target height, aspect locked. */
export function sizeFor(signature: SignatureAsset, heightPt: number): PlacedSize {
  const height = clampHeight(heightPt);
  return { heightPt: height, widthPt: height * aspectOf(signature) };
}

/**
 * A drop point read as the signature's CENTRE rather than its corner: the
 * attorney drops the ghost where they want the signature to sit, and a corner
 * anchor would park it up and to the right of the pointer every time.
 */
export function anchorFromCentre(centre: PdfPoint, size: PlacedSize): PdfPoint {
  return { x: centre.x - size.widthPt / 2, y: centre.y - size.heightPt / 2 };
}

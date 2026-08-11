/**
 * Where a stamp lands on a page that is not the right way up.
 *
 * A PDF stores its page unrotated and hangs a /Rotate flag off it; the reader
 * turns the paper clockwise by that flag before showing it. So the corner the
 * attorney points at ("bottom right") is a corner of the TURNED page, not of
 * the stored one, and ink drawn straight would read sideways.
 *
 * Everything here works in "visual space": origin at the bottom-left of the
 * page AS DISPLAYED, x right, y up. `toUserSpace` puts a visual point back into
 * the stored page's coordinates, and `uprightDegrees` is the rotation that
 * makes drawn ink read the right way up once the reader turns the paper.
 */

import type { Alignment, Corner, ExhibitPosition, PageSize, PdfPoint } from '@shared/types';

/** A page's stored size, its quarter turn, and the size the reader shows. */
export interface PageFrame {
  /** MediaBox size, rotation NOT applied. */
  media: PageSize;
  /** MediaBox bottom-left. Usually (0,0), but scanners do produce other origins. */
  origin: PdfPoint;
  /** /Rotate, normalized to 0, 90, 180, or 270. */
  rotation: number;
  /** The page as displayed — width and height swap on a quarter turn. */
  visual: PageSize;
}

/** Any /Rotate value (negative, 450, 89.6) as one of 0, 90, 180, 270. */
export function normalizeRotation(angle: number): number {
  return (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
}

export function frameOf(media: PageSize, angle: number, origin?: PdfPoint): PageFrame {
  const rotation = normalizeRotation(angle);
  const quarterTurned = rotation === 90 || rotation === 270;
  return {
    media,
    origin: origin ?? { x: 0, y: 0 },
    rotation,
    visual: quarterTurned
      ? { width: media.height, height: media.width }
      : { width: media.width, height: media.height },
  };
}

/** Visual space (what the reader sees) to the page's stored user space. */
export function toUserSpace(frame: PageFrame, point: PdfPoint): PdfPoint {
  const { width, height } = frame.media;
  const turned = rotateIntoMedia(frame.rotation, point, width, height);
  return { x: turned.x + frame.origin.x, y: turned.y + frame.origin.y };
}

function rotateIntoMedia(
  rotation: number,
  point: PdfPoint,
  width: number,
  height: number
): PdfPoint {
  switch (rotation) {
    case 90:
      return { x: width - point.y, y: point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: point.y, y: height - point.x };
    default:
      return { x: point.x, y: point.y };
  }
}

/** The inverse of `toUserSpace` — a stored point as the reader sees it. */
export function toVisualSpace(frame: PageFrame, point: PdfPoint): PdfPoint {
  const { width, height } = frame.media;
  const local = { x: point.x - frame.origin.x, y: point.y - frame.origin.y };
  switch (frame.rotation) {
    case 90:
      return { x: local.y, y: width - local.x };
    case 180:
      return { x: width - local.x, y: height - local.y };
    case 270:
      return { x: height - local.y, y: local.x };
    default:
      return local;
  }
}

/**
 * The rotation to hand pdf-lib so ink reads upright on the displayed page.
 * pdf-lib turns ink counter-clockwise; the reader turns the paper clockwise by
 * /Rotate, so the two cancel exactly when the ink turns by /Rotate.
 */
export function uprightDegrees(frame: PageFrame): number {
  return frame.rotation;
}

/** Size of a box, in points. Text boxes and stamps are both measured this way. */
export interface BoxSize {
  width: number;
  height: number;
}

/** Visual bottom-left of a box tucked into one corner, inset by `margin`. */
export function cornerAnchor(
  corner: Corner,
  visual: PageSize,
  box: BoxSize,
  margin: number
): PdfPoint {
  const atLeft = corner === 'top-left' || corner === 'bottom-left';
  const atTop = corner === 'top-left' || corner === 'top-right';
  return {
    x: atLeft ? margin : visual.width - margin - box.width,
    y: atTop ? visual.height - margin - box.height : margin,
  };
}

/**
 * Visual bottom-left of a stamp box at any exhibit position. The four corners
 * are `cornerAnchor` unchanged; 'bottom-center' sits on the same bottom edge at
 * the same margin, centred across the displayed width.
 */
export function stampAnchor(
  position: ExhibitPosition,
  visual: PageSize,
  box: BoxSize,
  margin: number
): PdfPoint {
  if (position === 'bottom-center') {
    return { x: (visual.width - box.width) / 2, y: margin };
  }
  return cornerAnchor(position, visual, box, margin);
}

/** Visual bottom-left of a box in a header or footer band, horizontally aligned. */
export function bandAnchor(
  placement: 'header' | 'footer',
  alignment: Alignment,
  visual: PageSize,
  box: BoxSize,
  margin: number
): PdfPoint {
  const free = visual.width - 2 * margin - box.width;
  const offsets: Record<Alignment, number> = {
    left: 0,
    center: free / 2,
    right: free,
  };
  return {
    x: margin + offsets[alignment],
    y: placement === 'header' ? visual.height - margin - box.height : margin,
  };
}

/**
 * Visual bottom-left of a box centred on the page and spun by `spin` degrees
 * about its own centre — how a diagonal watermark finds its anchor.
 */
export function centredAnchor(visual: PageSize, box: BoxSize, spin: number): PdfPoint {
  const radians = (spin * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  return {
    x: visual.width / 2 - (halfWidth * cos - halfHeight * sin),
    y: visual.height / 2 - (halfWidth * sin + halfHeight * cos),
  };
}

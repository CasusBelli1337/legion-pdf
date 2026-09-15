/**
 * Pictures. Two decisions, both about honesty:
 *
 * A picture that fills the page under an invisible text layer is a SCAN with
 * OCR. The attorney exporting to Word wants the words, editable — so the
 * recognised text is kept and the scan is left out, and the note says so.
 * Embedding the picture as well would put an uneditable copy of every page on
 * top of its editable text.
 *
 * Every other picture is placed inline in the flow at its own size, fitted to
 * the body width, aligned the way it sat on the page. Inline, not floating:
 * a floating anchor drifts when the paragraphs around it are edited, and the
 * attorney is going to edit them.
 */

import type { LayoutImage, PageLayout } from '@shared/types';
import type { Alignment, BodyFrame, ImageParagraph } from './model';

/** Smaller than this in either direction is a rule or a bullet, not a picture. */
const MIN_PICTURE_PT = 4;
/** A picture covering this share of the page is the page. */
const FULL_PAGE_SHARE = 0.6;

export interface ImagePlan {
  paragraphs: ImageParagraph[];
  notes: string[];
}

function isFullPage(image: LayoutImage, layout: PageLayout): boolean {
  const pageArea = layout.size.width * layout.size.height;
  return pageArea > 0 && (image.rect.width * image.rect.height) / pageArea >= FULL_PAGE_SHARE;
}

/** Flush with the frame's edge, or centred, within this many points. */
const EDGE_TOLERANCE = 6;

interface Placement {
  alignment: Alignment;
  indentLeftPt: number;
}

/** Centred when the room either side matches; otherwise placed exactly by indent. */
function placementFor(image: LayoutImage, widthPt: number, frame: BodyFrame): Placement {
  const leftGap = image.rect.x - frame.left;
  const rightGap = frame.right - (image.rect.x + widthPt);
  if (Math.abs(rightGap) <= EDGE_TOLERANCE && leftGap > EDGE_TOLERANCE) {
    return { alignment: 'right', indentLeftPt: 0 };
  }
  if (Math.abs(leftGap - rightGap) <= EDGE_TOLERANCE && leftGap > EDGE_TOLERANCE) {
    return { alignment: 'center', indentLeftPt: 0 };
  }
  return { alignment: 'left', indentLeftPt: Math.max(0, leftGap) };
}

function fitted(image: LayoutImage, frame: BodyFrame): { widthPt: number; heightPt: number } {
  const room = Math.max(1, frame.right - frame.left);
  const scale = Math.min(1, room / image.rect.width);
  return { widthPt: image.rect.width * scale, heightPt: image.rect.height * scale };
}

function inline(image: LayoutImage, frame: BodyFrame): ImageParagraph {
  const size = fitted(image, frame);
  return {
    kind: 'image',
    image,
    ...size,
    ...placementFor(image, size.widthPt, frame),
    spaceBeforePt: 0,
    top: image.rect.y + image.rect.height,
  };
}

/**
 * Which pictures go in and how. `hasText` / `hasHiddenText` describe the page's
 * body runs, which is what tells a scan from a photograph.
 */
export function planImages(
  layout: PageLayout,
  frame: BodyFrame,
  text: { hasText: boolean; hasHiddenText: boolean }
): ImagePlan {
  const plan: ImagePlan = { paragraphs: [], notes: [] };
  for (const image of layout.images) {
    if (image.rect.width < MIN_PICTURE_PT || image.rect.height < MIN_PICTURE_PT) continue;
    if (isFullPage(image, layout) && text.hasHiddenText) {
      plan.notes.push(
        `Page ${layout.page} is a scan: the recognized text was kept as editable text and the picture was left out.`
      );
      continue;
    }
    if (isFullPage(image, layout) && text.hasText) {
      plan.notes.push(
        `Page ${layout.page} has a full-page picture behind its text; the text was kept and the picture left out.`
      );
      continue;
    }
    plan.paragraphs.push(inline(image, frame));
  }
  return plan;
}

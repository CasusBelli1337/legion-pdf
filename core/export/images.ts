/**
 * Pictures. Two decisions, both about honesty:
 *
 * A picture that fills the page under an invisible text layer is a SCAN with
 * OCR. The attorney exporting to Word wants the words, editable — so the
 * recognised text is always kept, and `scanPictures` says what becomes of the
 * picture: left out (the default, and the only honest answer when nobody asked
 * for it), laid behind the text the way a searchable PDF keeps its scan, or
 * gathered into an appendix after the last page.
 *
 * Every other picture is placed inline in the flow at its own size, fitted to
 * the body width, aligned the way it sat on the page. Inline, not floating:
 * a floating anchor drifts when the paragraphs around it are edited, and the
 * attorney is going to edit them.
 */

import type { LayoutImage, PageLayout, ScanPictureMode } from '@shared/types';
import type { Alignment, BodyFrame, ImageParagraph } from './model';
import { bodyExtents, pageSizeOf } from './page-setup';

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

/** Body text that pdfjs saw in render mode 3 — the invisible layer over a scan. */
function hasHiddenBodyText(layout: PageLayout): boolean {
  return layout.runs.some(
    (run) => run.role === 'body' && run.text.trim().length > 0 && run.hidden === true
  );
}

/**
 * The full-page picture under a page's invisible OCR text, or null when the
 * page is not a scan. `scan-appendix.ts` asks this of the WHOLE layout, which
 * is why the test lives here beside the one `planImages` makes per column.
 */
export function scannedPictureOf(layout: PageLayout): LayoutImage | null {
  if (!hasHiddenBodyText(layout)) return null;
  return layout.images.find((image) => isFullPage(image, layout)) ?? null;
}

/**
 * Which image paragraphs carry the page's scan as a floating anchor rather
 * than an inline picture. A side table rather than a field on `ImageParagraph`
 * because `model.ts` belongs to the pleading lane; `docx-image.ts` is the only
 * reader, and paragraph identity survives `settlePage` untouched.
 */
const BEHIND_PAGE = new WeakSet<ImageParagraph>();

export function isBehindPage(paragraph: ImageParagraph): boolean {
  return BEHIND_PAGE.has(paragraph);
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
 * The scan as a floating anchor. Its box is a POINT on the page — top and
 * bottom both at the top of the body text — so the gap arithmetic in
 * `settlePage` is unchanged: the space above it plus the space below it is the
 * space that was there before, and the anchor itself is an exact 1-twip line
 * (docx-image.ts). An anchor whose box had the picture's real height would
 * swallow the whole page and collapse every gap under it to nothing.
 */
function behindPage(image: LayoutImage, layout: PageLayout): ImageParagraph {
  const anchor = bodyExtents(layout)?.top ?? image.rect.y + image.rect.height;
  const size = pageSizeOf(layout);
  const paragraph: ImageParagraph = {
    kind: 'image',
    image: { ...image, rect: { ...image.rect, y: anchor } },
    widthPt: size.width,
    heightPt: size.height,
    alignment: 'left',
    indentLeftPt: 0,
    spaceBeforePt: 0,
    top: anchor,
  };
  BEHIND_PAGE.add(paragraph);
  return paragraph;
}

/**
 * Which pictures go in and how. `hasText` / `hasHiddenText` describe the page's
 * body runs, which is what tells a scan from a photograph.
 */
export interface ImagePlanInput {
  hasText: boolean;
  hasHiddenText: boolean;
  /** What to do with a scan's picture; 'omit' when the attorney has not chosen. */
  scanPictures?: ScanPictureMode;
}

export const scanOmittedNote = (page: number): string =>
  `Page ${page} is a scan: the recognized text was kept as editable text and the picture was left out.`;

/**
 * The scan's picture, per the chosen mode. 'appendix' adds nothing here —
 * `scanAppendixSections` writes those pages after the body — and neither mode
 * that KEEPS the picture leaves a note, because a note is a record of
 * something lost.
 */
function scanPicture(
  image: LayoutImage,
  layout: PageLayout,
  mode: ScanPictureMode,
  plan: ImagePlan
): void {
  if (mode === 'behind') plan.paragraphs.push(behindPage(image, layout));
  else if (mode === 'omit') plan.notes.push(scanOmittedNote(layout.page));
}

export function planImages(layout: PageLayout, frame: BodyFrame, text: ImagePlanInput): ImagePlan {
  const plan: ImagePlan = { paragraphs: [], notes: [] };
  const mode = text.scanPictures ?? 'omit';
  for (const image of layout.images) {
    if (image.rect.width < MIN_PICTURE_PT || image.rect.height < MIN_PICTURE_PT) continue;
    if (isFullPage(image, layout) && text.hasHiddenText) {
      scanPicture(image, layout, mode, plan);
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

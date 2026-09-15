/**
 * Pictures in the Word file. Inline ImageRuns at their fitted size, placed by
 * alignment or indent — inline, not floating, because a floating anchor drifts
 * when the paragraphs around it are edited, and the attorney is going to edit
 * them.
 *
 * The one exception is a page's own SCAN, which the attorney asked to keep
 * behind the recognised text (`scanPictures: 'behind'`): that one is anchored
 * to the page, sized to the paper, and pushed behind the text, exactly the way
 * a searchable PDF keeps its scan under its OCR layer. Its paragraph is an
 * exact 1-twip line so it carries the anchor without taking a line of its own —
 * the recognised text must not move down to make room for its own picture.
 */

import {
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Paragraph as DocxParagraph,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from 'docx';
import type { IFloating } from 'docx';
import { ALIGNMENT, withColumnBreak } from './docx-paragraph';
import type { ParagraphPlacement } from './docx-paragraph';
import { isBehindPage } from './images';
import type { ImageParagraph } from './model';
import { pixels, twips } from './model';

/**
 * The smallest line Word will set. The anchor paragraph has to exist (an
 * anchor lives in a paragraph) but must add no height to the page.
 */
export const ANCHOR_LINE_TWIPS = 1;

const BEHIND_THE_TEXT: IFloating = {
  horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
  verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
  behindDocument: true,
  allowOverlap: true,
  wrap: { type: TextWrappingType.NONE },
};

function imageRun(paragraph: ImageParagraph, floating: IFloating | null): ImageRun {
  return new ImageRun({
    type: 'png',
    data: paragraph.image.png,
    transformation: { width: pixels(paragraph.widthPt), height: pixels(paragraph.heightPt) },
    ...(floating === null ? {} : { floating }),
  });
}

/** The scan behind the page: page-anchored, page-sized, zero height in the flow. */
function behindParagraph(paragraph: ImageParagraph, placement: ParagraphPlacement): DocxParagraph {
  return new DocxParagraph({
    spacing: {
      before: twips(paragraph.spaceBeforePt),
      after: 0,
      line: ANCHOR_LINE_TWIPS,
      lineRule: LineRuleType.EXACT,
    },
    pageBreakBefore: placement.pageBreakBefore,
    children: withColumnBreak(paragraph, [imageRun(paragraph, BEHIND_THE_TEXT)]),
  });
}

export function docxImageParagraph(
  paragraph: ImageParagraph,
  placement: ParagraphPlacement
): DocxParagraph {
  if (isBehindPage(paragraph)) return behindParagraph(paragraph, placement);
  return new DocxParagraph({
    alignment: ALIGNMENT[paragraph.alignment],
    spacing: { before: twips(paragraph.spaceBeforePt), after: 0 },
    ...(paragraph.indentLeftPt > 0 ? { indent: { left: twips(paragraph.indentLeftPt) } } : {}),
    pageBreakBefore: placement.pageBreakBefore,
    children: withColumnBreak(paragraph, [imageRun(paragraph, null)]),
  });
}

/** A full-page picture of its own, for the scanned-pages appendix. */
export function fullPageImageRun(png: Uint8Array, widthPt: number, heightPt: number): ImageRun {
  return new ImageRun({
    type: 'png',
    data: png,
    transformation: { width: pixels(widthPt), height: pixels(heightPt) },
  });
}

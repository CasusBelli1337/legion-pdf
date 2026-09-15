/**
 * Pictures in the Word file. Inline ImageRuns at their fitted size, placed by
 * alignment or indent — inline, not floating, because a floating anchor drifts
 * when the paragraphs around it are edited, and the attorney is going to edit
 * them. The scan lane adds the other placements: a page picture behind the
 * recognised text, and full-page pictures in an appendix.
 */

import { ImageRun, Paragraph as DocxParagraph } from 'docx';
import { ALIGNMENT, withColumnBreak } from './docx-paragraph';
import type { ParagraphPlacement } from './docx-paragraph';
import type { ImageParagraph } from './model';
import { pixels, twips } from './model';

export function docxImageParagraph(
  paragraph: ImageParagraph,
  placement: ParagraphPlacement
): DocxParagraph {
  return new DocxParagraph({
    alignment: ALIGNMENT[paragraph.alignment],
    spacing: { before: twips(paragraph.spaceBeforePt), after: 0 },
    ...(paragraph.indentLeftPt > 0 ? { indent: { left: twips(paragraph.indentLeftPt) } } : {}),
    pageBreakBefore: placement.pageBreakBefore,
    children: withColumnBreak(paragraph, [
      new ImageRun({
        type: 'png',
        data: paragraph.image.png,
        transformation: { width: pixels(paragraph.widthPt), height: pixels(paragraph.heightPt) },
      }),
    ]),
  });
}

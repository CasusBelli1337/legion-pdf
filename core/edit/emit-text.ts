/**
 * Drawing edited text back onto the page IN THE DOCUMENT'S OWN FONT. The face
 * is already a resource of the page (`/F3`, say), so the new operators simply
 * name it — no embedding, no second copy — and show the codes the font's own
 * character map hands back for the new words.
 *
 * pdf-lib's `pushOperators` is used rather than a hand-spliced stream because
 * it wraps the page's existing content in `q … Q` first, which guarantees the
 * transform is identity when these operators run: the positions the layout
 * computed in user space land in user space.
 */

import {
  PDFArray,
  PDFHexString,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  type PDFPage,
} from 'pdf-lib';
import type { FontCodec } from './font-codec';
import type { FoundBlock } from './inspect-text';
import { fromFrame } from './text-lines';
import type { LaidLine } from './text-layout';

export interface EmittedLines {
  glyphs: number;
  /** String bytes added — what the shown-character count moves by. */
  bytes: number;
}

function hexOf(codes: readonly number[], codeBytes: 1 | 2): PDFHexString {
  return PDFHexString.of(
    codes
      .map((code) =>
        code
          .toString(16)
          .toUpperCase()
          .padStart(codeBytes * 2, '0')
      )
      .join('')
  );
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** `[ <…> n <…> ] TJ` — the words of one line with the justification gaps between them. */
function showLine(
  page: PDFPage,
  line: LaidLine,
  codec: FontCodec,
  size: number
): { operator: PDFOperator; glyphs: number } {
  const context = page.doc.context;
  const array = PDFArray.withContext(context);
  const space = codec.encode(' ');
  const spaceCodes = space.missing.length === 0 ? space.codes : [];
  let glyphs = 0;
  line.words.forEach((word, index) => {
    const isLast = index === line.words.length - 1;
    const codes = [...codec.encode(word.text).codes, ...(isLast ? [] : spaceCodes)];
    array.push(hexOf(codes, codec.codeBytes));
    glyphs += codes.length;
    if (isLast) return;
    // A gap the space glyph does not cover is a negative TJ number: it moves the pen right.
    const gap = line.extraPerGap + (spaceCodes.length === 0 ? size * 0.25 : 0);
    if (gap > 0) array.push(PDFNumber.of(Number(((-gap * 1000) / size).toFixed(3))));
  });
  return { operator: PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]), glyphs };
}

/** Draws every laid-out line in the paragraph's frame; returns what was added. */
export function emitDocumentFontLines(
  page: PDFPage,
  found: FoundBlock,
  laid: readonly LaidLine[],
  codec: FontCodec
): EmittedLines {
  const { block, angle } = found;
  const size = block.font.sizePt;
  const first = found.lines[0]?.baseline ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const operators: PDFOperator[] = [
    pushGraphicsState(),
    beginText(),
    setFillingRgbColor(...channels(block.font.colorHex)),
    setFontAndSize(found.fontName, size),
  ];
  let glyphs = 0;
  for (const line of laid) {
    if (line.words.length === 0) continue;
    const at = fromFrame({ along: line.start, across: first - line.row * block.leadingPt }, angle);
    operators.push(setTextMatrix(cos, sin, -sin, cos, at.x, at.y));
    const shown = showLine(page, line, codec, size);
    operators.push(shown.operator);
    glyphs += shown.glyphs;
  }
  operators.push(endText(), popGraphicsState());
  page.pushOperators(...operators);
  return { glyphs, bytes: glyphs * codec.codeBytes };
}

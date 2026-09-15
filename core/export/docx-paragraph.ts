/**
 * From the model's paragraphs to the docx package's. The one place the docx
 * API is spoken for body text: exact line spacing in twips, indents in twips,
 * runs carrying the Word font name, half-point size, bold, italic, colour,
 * underline. Pictures become inline ImageRuns at their fitted size.
 *
 * Lines of one paragraph are JOINED into flowing text — that is the whole
 * point of exporting to Word — with a hyphen at a line's end healed when the
 * next line continues the word.
 */

import {
  AlignmentType,
  ColumnBreak,
  ImageRun,
  LineRuleType,
  PageNumber,
  Paragraph as DocxParagraph,
  Tab,
  TabStopType,
  TextRun,
} from 'docx';
import type { IParagraphOptions, IRunOptions } from 'docx';
import type { LayoutFont } from '@shared/types';
import { sameStyle } from './lines';
import type { Alignment, ImageParagraph, Line, StyledRun, TextParagraph } from './model';
import { pixels, twips } from './model';
import { halfPoints, runStyleFor } from './styles';

/**
 * A run whose text contains this shows the current page number — a Word PAGE
 * field, so the numbers keep counting as the attorney edits. Control
 * characters, so no real text can collide with it.
 */
export const PAGE_FIELD = '\u0000PAGE\u0000';

const ALIGNMENT: Record<Alignment, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

type Fonts = Readonly<Record<string, LayoutFont>>;

const UNNAMED_FONT: LayoutFont = { name: '', family: 'serif', bold: false, italic: false };

function runOptions(run: StyledRun, fonts: Fonts): IRunOptions {
  const style = runStyleFor(fonts[run.fontKey] ?? UNNAMED_FONT);
  return {
    font: style.wordFont,
    size: halfPoints(run.sizePt),
    bold: style.bold,
    italics: style.italic,
    color: run.colorHex,
    ...(run.underline ? { underline: {} } : {}),
  };
}

/** Text with PAGE_FIELD inside it becomes text, a page-number field, text. */
function pieces(text: string): (string | typeof PageNumber.CURRENT)[] {
  return text
    .split(PAGE_FIELD)
    .flatMap((part, index) => (index === 0 ? [part] : [PageNumber.CURRENT, part]))
    .filter((part) => part !== '');
}

function textRun(run: StyledRun, fonts: Fonts): TextRun {
  return new TextRun({ ...runOptions(run, fonts), children: pieces(run.text) });
}

/** Adds a run to the flow, merging it into the last one when the style is the same. */
function flow(joined: StyledRun[], run: StyledRun): void {
  const previous = joined.at(-1);
  if (previous !== undefined && sameStyle(previous, run)) previous.text += run.text;
  else joined.push({ ...run });
}

/** "signa-" + "ture" → "signature"; otherwise lines meet at a space. */
export function joinLines(lines: readonly Line[]): StyledRun[] {
  const joined: StyledRun[] = [];
  lines.forEach((line, index) => {
    const runs = line.cells.flatMap((cell) => cell.runs);
    const previous = joined.at(-1);
    const next = runs[0];
    if (previous !== undefined && next !== undefined && index > 0) {
      const heals = /[a-z]-$/.test(previous.text) && /^[a-z]/.test(next.text);
      if (heals) previous.text = previous.text.slice(0, -1);
      else if (!previous.text.endsWith(' ')) previous.text += ' ';
    }
    for (const run of runs) flow(joined, run);
  });
  return joined;
}

/** A tabular line: cells separated by tabs, each cell's runs kept. */
function tabbedChildren(line: Line, fonts: Fonts): TextRun[] {
  return line.cells.flatMap((cell, index) => {
    const runs = cell.runs.map((run) => textRun(run, fonts));
    if (index === 0) return runs;
    const first = cell.runs[0];
    const tab = new TextRun({ ...(first ? runOptions(first, fonts) : {}), children: [new Tab()] });
    return [tab, ...runs];
  });
}

function childrenOf(paragraph: TextParagraph, fonts: Fonts): TextRun[] {
  if (paragraph.tabStopsPt.length > 0) {
    return paragraph.lines.flatMap((line) => tabbedChildren(line, fonts));
  }
  return joinLines(paragraph.lines).map((run) => textRun(run, fonts));
}

function indentOf(paragraph: TextParagraph): IParagraphOptions['indent'] | undefined {
  const { indentLeftPt, indentRightPt, firstLinePt } = paragraph;
  if (indentLeftPt === 0 && indentRightPt === 0 && firstLinePt === 0) return undefined;
  return {
    left: twips(indentLeftPt),
    right: twips(indentRightPt),
    ...(firstLinePt > 0 ? { firstLine: twips(firstLinePt) } : {}),
    ...(firstLinePt < 0 ? { hanging: twips(-firstLinePt) } : {}),
  };
}

export interface ParagraphPlacement {
  pageBreakBefore: boolean;
}

/** A column break run ahead of the children when the paragraph opens column two. */
function withColumnBreak<T>(paragraph: { columnBreakBefore?: boolean }, children: T[]) {
  return paragraph.columnBreakBefore === true ? [new ColumnBreak(), ...children] : children;
}

export function docxTextParagraph(
  paragraph: TextParagraph,
  fonts: Fonts,
  placement: ParagraphPlacement
): DocxParagraph {
  const indent = indentOf(paragraph);
  return new DocxParagraph({
    alignment: ALIGNMENT[paragraph.alignment],
    spacing: {
      line: twips(paragraph.leadingPt),
      lineRule: LineRuleType.EXACT,
      before: twips(paragraph.spaceBeforePt),
      after: 0,
    },
    ...(indent === undefined ? {} : { indent }),
    tabStops: paragraph.tabStopsPt.map((stop) => ({
      type: TabStopType.LEFT,
      position: twips(stop),
    })),
    pageBreakBefore: placement.pageBreakBefore,
    children: withColumnBreak(paragraph, childrenOf(paragraph, fonts)),
  });
}

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

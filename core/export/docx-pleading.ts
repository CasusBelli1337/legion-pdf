/**
 * The pleading template's own architecture, rebuilt: a header-anchored table
 * whose first cell holds every line number on an exact pitch (right aligned,
 * in the numbers' own face), whose cell boundary carries the rule beside the
 * numbers, and whose right border is the rule down the right edge; a fixed
 * (negative-twip) top margin puts the body's line 1 beside number 1. Word
 * places a baseline 80% of the way down an exact line box, so the numbers'
 * space-before and the body's top margin are both derived from where line 1
 * sat on the page — the two land together to the twip.
 */

import {
  BorderStyle,
  Header,
  HeightRule,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { IBorderOptions, ISectionOptions, Paragraph as DocxParagraph } from 'docx';
import type { LayoutFont } from '@shared/types';
import { BASELINE_SHARE, twips } from './model';
import type { SectionGeometry } from './page-setup';
import type { Pleading, RuleStyle } from './pleading';
import { halfPoints, runStyleFor } from './styles';

type Fonts = Readonly<Record<string, LayoutFont>>;
type PageMargins = NonNullable<
  NonNullable<NonNullable<ISectionOptions['properties']>['page']>['margin']
>;

/** Room left of the numbers before the table's left edge, points. */
const NUMBER_PAD = 6;
/** Where the numbers' cell ends when no rule was drawn beside them. */
const NO_RULE_GAP = 8;
/** The header may not start closer to the paper's edge than this. */
const MIN_HEADER = 12;
const DEFAULT_HEADER = 36;
/** Slack under the last line (× pitch) so twip rounding never pushes line 28 onto a page of its own. */
const BOTTOM_SLACK = 0.5;

const NIL: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' };

function ruleBorder(style: RuleStyle): IBorderOptions {
  if (style === 'double') return { style: BorderStyle.DOUBLE, size: 6, color: '000000' };
  if (style === 'single') return { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  return NIL;
}

/** The pleading section's vertical layout, measured from the paper's top edge, points. */
export interface PleadingFrame {
  /** Top of line 1's box — the body's fixed top margin. */
  lineOneTop: number;
  headerPt: number;
  /** Space above the numbers inside the header, so number 1 lands on line 1. */
  numbersBefore: number;
  bottomPt: number;
  /** Table geometry from the paper's left edge, points. */
  tableLeft: number;
  boundary: number;
  tableRight: number;
}

export function pleadingFrame(pleading: Pleading, geometry: SectionGeometry): PleadingFrame {
  const { height, width } = geometry.size;
  const lineOneTop = height - (pleading.firstBaseline + BASELINE_SHARE * pleading.pitchPt);
  const headerPt = Math.max(
    MIN_HEADER,
    Math.min(DEFAULT_HEADER, geometry.headerPt, lineOneTop - 2)
  );
  const boundary = pleading.rules.innerX ?? pleading.numberRight + NO_RULE_GAP;
  const headRight = Math.max(
    0,
    ...geometry.pages.flatMap((page) =>
      page.runs.filter((run) => run.role === 'header').map((run) => run.x + run.width + 2)
    )
  );
  return {
    lineOneTop,
    headerPt,
    numbersBefore: lineOneTop - headerPt,
    bottomPt: Math.max(
      0,
      height - (lineOneTop + (pleading.count + BOTTOM_SLACK) * pleading.pitchPt)
    ),
    tableLeft: Math.max(0, pleading.numberLeft - NUMBER_PAD),
    boundary,
    tableRight: pleading.rules.rightX ?? Math.min(width, Math.max(geometry.frame.right, headRight)),
  };
}

/** Top and bottom as Word wants them for a pleading section: exact (negative) and floor. */
export function pleadingMargins(frame: PleadingFrame, margins: PageMargins): PageMargins {
  return {
    ...margins,
    top: -twips(frame.lineOneTop),
    bottom: twips(frame.bottomPt),
    header: twips(frame.headerPt),
  };
}

function numberRuns(pleading: Pleading, fonts: Fonts): TextRun[] {
  const font = fonts[pleading.fontKey];
  const style =
    font === undefined
      ? { wordFont: 'Times New Roman', bold: false, italic: false }
      : runStyleFor(font);
  return Array.from(
    { length: pleading.count },
    (_unused, index) =>
      new TextRun({
        text: String(index + 1),
        font: style.wordFont,
        size: halfPoints(pleading.sizePt),
        ...(index > 0 ? { break: 1 } : {}),
      })
  );
}

function numberCell(pleading: Pleading, frame: PleadingFrame, fonts: Fonts): TableCell {
  return new TableCell({
    width: { size: twips(frame.boundary - frame.tableLeft), type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: { top: NIL, bottom: NIL, left: NIL, right: ruleBorder(pleading.rules.inner) },
    children: [
      new Paragraph({
        alignment: 'right',
        indent: { right: twips(Math.max(0, frame.boundary - pleading.numberRight)) },
        spacing: {
          line: twips(pleading.pitchPt),
          lineRule: 'exact',
          before: twips(frame.numbersBefore),
          after: 0,
        },
        children: numberRuns(pleading, fonts),
      }),
    ],
  });
}

function bodyCell(pleading: Pleading, frame: PleadingFrame, children: DocxParagraph[]): TableCell {
  return new TableCell({
    width: { size: twips(frame.tableRight - frame.boundary), type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: { top: NIL, bottom: NIL, left: NIL, right: ruleBorder(pleading.rules.right) },
    children:
      children.length === 0
        ? [new Paragraph({ spacing: { line: 1, lineRule: 'exact', before: 0, after: 0 } })]
        : children,
  });
}

/**
 * The header: one table row of exact height holding the numbers and the rules,
 * with the running head (already laid out as paragraphs from the header's top)
 * in the body cell.
 */
export function pleadingHeader(
  pleading: Pleading,
  frame: PleadingFrame,
  geometry: SectionGeometry,
  fonts: Fonts,
  runningHead: DocxParagraph[]
): Header {
  const rowHeight = frame.numbersBefore + pleading.count * pleading.pitchPt + 2;
  return new Header({
    children: [
      new Table({
        layout: 'fixed',
        width: { size: twips(frame.tableRight - frame.tableLeft), type: WidthType.DXA },
        columnWidths: [
          twips(frame.boundary - frame.tableLeft),
          twips(frame.tableRight - frame.boundary),
        ],
        indent: { size: twips(frame.tableLeft - geometry.margins.left), type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        borders: {
          top: NIL,
          bottom: NIL,
          left: NIL,
          right: NIL,
          insideHorizontal: NIL,
          insideVertical: NIL,
        },
        rows: [
          new TableRow({
            height: { value: twips(rowHeight), rule: HeightRule.EXACT },
            children: [numberCell(pleading, frame, fonts), bodyCell(pleading, frame, runningHead)],
          }),
        ],
      }),
    ],
  });
}

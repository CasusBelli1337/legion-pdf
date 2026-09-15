/**
 * From the model's ruled tables to the docx package's `Table`: fixed column
 * widths from the grid, exact row heights from the row edges — so a table on
 * pleading paper keeps the 24 pt grid rather than growing to fit Word's idea
 * of the type — borders only where the page drew them, and each cell's lines
 * run through the ordinary paragraph pass inside the cell's own frame.
 *
 * Everything measured across the page (`columnEdges`, the cells' lines) is in
 * points from the body frame's left edge; everything measured down it
 * (`rowEdges`, baselines) is page y. Owned by the tables lane; `build-docx.ts`
 * calls this and nothing else does.
 */

import {
  BorderStyle,
  HeightRule,
  Paragraph as DocxParagraph,
  Table,
  TableCell as DocxTableCell,
  TableLayoutType,
  TableRow,
  WidthType,
} from 'docx';
import type { IBorderOptions, ITableCellBorders } from 'docx';
import type { LayoutFont } from '@shared/types';
import type { ParagraphPlacement } from './docx-paragraph';
import { docxTextParagraph } from './docx-paragraph';
import { BASELINE_SHARE, twips } from './model';
import type { BodyFrame, TableBorders, TableCell, TableParagraph, TextParagraph } from './model';
import { paragraphsOf } from './paragraphs';

type Fonts = Readonly<Record<string, LayoutFont>>;

/** Half a point: the hairline a caption box is ruled with. */
const DRAWN: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: 'auto' };
const UNDRAWN: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: 'auto' };
/** A cell's text never sits further in from its rule than this. */
const MAX_INSET = 24;

interface Build {
  table: TableParagraph;
  fonts: Fonts;
  /** Distance from a column edge to its text, points — the same on both sides. */
  inset: number;
  pageBreakBefore: boolean;
}

function edge(edges: readonly number[], index: number): number {
  return edges[index] ?? 0;
}

/**
 * How far the table's text sits in from its rules: the SMALLEST gap any cell's
 * text keeps from its column edge. Taking the smallest is what keeps every
 * paragraph's own indent positive — Word cannot indent text left of the cell.
 */
function insetOf(table: TableParagraph): number {
  const gaps = table.cells.flatMap((row) =>
    row.flatMap((cell, column) =>
      cell.lines.map((line) => line.x - edge(table.columnEdges, column))
    )
  );
  return gaps.length === 0 ? 0 : Math.min(MAX_INSET, Math.max(0, Math.min(...gaps)));
}

function borderOf(drawn: boolean): IBorderOptions {
  return drawn ? DRAWN : UNDRAWN;
}

function bordersAt(borders: TableBorders, row: number, column: number): ITableCellBorders {
  return {
    top: borderOf(borders.horizontal[row]?.[column] === true),
    bottom: borderOf(borders.horizontal[row + 1]?.[column] === true),
    left: borderOf(borders.vertical[row]?.[column] === true),
    right: borderOf(borders.vertical[row]?.[column + 1] === true),
  };
}

/** The cell's own frame: its rules, less the inset Word will add back. */
function cellFrame(build: Build, cell: TableCell, column: number): BodyFrame {
  const { columnEdges } = build.table;
  const left = edge(columnEdges, column) + build.inset;
  const right = Math.max(left + 1, edge(columnEdges, column + 1) - build.inset);
  const widest = Math.max(left + 1, ...cell.lines.map((line) => line.right));
  return { left, right, textRight: Math.min(right, widest) };
}

/**
 * Space-before for each of a cell's paragraphs, the first measured from the
 * row's top rule — the same arithmetic settlePage does down the page, so a
 * caption's second line sits where the PDF had it rather than hard against
 * the line above.
 */
function settle(paragraphs: readonly TextParagraph[], top: number): void {
  let previousBottom = top;
  for (const paragraph of paragraphs) {
    const first = paragraph.lines[0]?.baseline ?? 0;
    const last = paragraph.lines.at(-1)?.baseline ?? 0;
    const boxTop = first + BASELINE_SHARE * paragraph.leadingPt;
    paragraph.spaceBeforePt = Math.max(0, previousBottom - boxTop);
    previousBottom = last - (1 - BASELINE_SHARE) * paragraph.leadingPt;
  }
}

/** A cell's lines as Word paragraphs; an empty cell still needs one. */
function cellParagraphs(build: Build, row: number, column: number): DocxParagraph[] {
  const cell = build.table.cells[row]?.[column] ?? { lines: [] };
  const breaks = build.pageBreakBefore && row === 0 && column === 0;
  if (cell.lines.length === 0) return [new DocxParagraph({ pageBreakBefore: breaks })];
  const paragraphs = paragraphsOf(cell.lines, { frame: cellFrame(build, cell, column) });
  settle(paragraphs, edge(build.table.rowEdges, row));
  return paragraphs.map((paragraph, index) =>
    docxTextParagraph(paragraph, build.fonts, { pageBreakBefore: breaks && index === 0 })
  );
}

function tableCell(build: Build, row: number, column: number): DocxTableCell {
  const { columnEdges } = build.table;
  return new DocxTableCell({
    width: {
      size: twips(edge(columnEdges, column + 1) - edge(columnEdges, column)),
      type: WidthType.DXA,
    },
    borders: bordersAt(build.table.borders, row, column),
    children: cellParagraphs(build, row, column),
  });
}

function tableRow(build: Build, row: number): TableRow {
  const { rowEdges, columnEdges } = build.table;
  const height = Math.max(1, edge(rowEdges, row) - edge(rowEdges, row + 1));
  return new TableRow({
    height: { value: twips(height), rule: HeightRule.EXACT },
    cantSplit: true,
    children: Array.from({ length: columnEdges.length - 1 }, (_column, index) =>
      tableCell(build, row, index)
    ),
  });
}

function columnWidths(table: TableParagraph): number[] {
  return table.columnEdges
    .slice(1)
    .map((right, index) => twips(right - edge(table.columnEdges, index)));
}

export function docxTable(
  paragraph: TableParagraph,
  fonts: Fonts,
  placement: ParagraphPlacement
): Table {
  const build: Build = {
    table: paragraph,
    fonts,
    inset: insetOf(paragraph),
    pageBreakBefore: placement.pageBreakBefore,
  };
  const widths = columnWidths(paragraph);
  return new Table({
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    width: { size: widths.reduce((total, width) => total + width, 0), type: WidthType.DXA },
    indent: { size: twips(edge(paragraph.columnEdges, 0)), type: WidthType.DXA },
    // The cells carry every border the page actually drew; the table itself
    // must draw none, or Word rules the edges the filing left open.
    borders: {
      top: UNDRAWN,
      bottom: UNDRAWN,
      left: UNDRAWN,
      right: UNDRAWN,
      insideHorizontal: UNDRAWN,
      insideVertical: UNDRAWN,
    },
    margins: {
      marginUnitType: WidthType.DXA,
      top: 0,
      bottom: 0,
      left: twips(build.inset),
      right: twips(build.inset),
    },
    rows: paragraph.cells.map((_row, index) => tableRow(build, index)),
  });
}

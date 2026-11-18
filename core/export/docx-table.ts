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
 *
 * A Word table cannot carry space above it — OOXML has no space-before on a
 * `w:tbl` — so `spaceBeforePt` is NOT written here. The caller has to emit it
 * as an empty paragraph of exactly that height before the table, or the table
 * and everything under it rides up the page by the gap the PDF left above it.
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
import { fitToRow } from './cell-fit';
import { docxTextParagraph } from './docx-paragraph';
import { BASELINE_SHARE, twips } from './model';
import type { BodyFrame, TableBorders, TableCell, TableParagraph, TextParagraph } from './model';
import { medianLeading, paragraphsOf } from './paragraphs';

type Fonts = Readonly<Record<string, LayoutFont>>;

/** Half a point: the hairline a caption box is ruled with. */
const DRAWN: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: 'auto' };
const UNDRAWN: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: 'auto' };
/** A cell's text never sits further in from its rule than this. */
const MAX_INSET = 24;
/** Word starts a cell's content below the border it drew, by the width of it. */
const BORDER_PT = 4 / 8;

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

/**
 * The right inset, cut back where the cell's own text needs the room. A
 * caption's right column is only ruled a couple of points past its longest
 * line; take the whole inset off that as well and Word has less room than the
 * page had, and wraps a line that fitted — which drops everything under it in
 * the cell by a line.
 */
function rightInset(build: Build, cell: TableCell, column: number): number {
  // A scan's words are only nearly as wide in Word as they were scanned: they
  // get the whole cell, to its rule, so a hair over does not wrap the line.
  if (isRecognized(cell)) return 0;
  const widest = Math.max(0, ...cell.lines.map((line) => line.right));
  return Math.max(0, Math.min(build.inset, edge(build.table.columnEdges, column + 1) - widest));
}

function isRecognized(cell: TableCell): boolean {
  const runs = cell.lines.flatMap((line) => line.cells.flatMap((part) => part.runs));
  return runs.length > 0 && runs.every((run) => run.hidden);
}

/**
 * The cell's own frame: its rules, less the inset Word will add back.
 *
 * `textRight` is the cell's right edge, not its longest line: a caption cell
 * holds "JANE DOE, an individual," over "Plaintiff," — two lines that each
 * stop well short of the rule. Measured against the longest line they read as
 * a justified paragraph (Word then spreads the first line to the rule) and as
 * one flowing paragraph (Word then rewraps the pair). Measured against the
 * rule they read as what they are: two short lines, each its own paragraph.
 * A cell whose text does reach past the inset keeps its own width, so nothing
 * that fitted in the PDF wraps in Word.
 */
function cellFrame(build: Build, cell: TableCell, column: number): BodyFrame {
  const { columnEdges } = build.table;
  const left = edge(columnEdges, column) + build.inset;
  const right = Math.max(left + 1, edge(columnEdges, column + 1) - rightInset(build, cell, column));
  return { left, right, textRight: Math.max(right, ...cell.lines.map((line) => line.right)) };
}

/**
 * A caption cell is not set on one pitch: the party block runs on twelve
 * points and the blanks between blocks on twenty-four. A lone line handed the
 * cell's MEDIAN pitch gets a line box taller than the gap it sat in, and Word
 * pushes it — or the tighter line under it — down the cell. So a lone line's
 * box is never taller than the room it had: the gap to the line above (to the
 * row's top edge, for the cell's first line) or to the line below, whichever
 * is less, and never tighter than its own type.
 */
function ownPitch(paragraphs: readonly TextParagraph[], index: number, top: number): number {
  const paragraph = paragraphs[index];
  const line = paragraph?.lines[0];
  if (paragraph === undefined || line === undefined) return 0;
  if (paragraph.lines.length > 1) return paragraph.leadingPt;
  const rooms = [roomAbove(paragraphs, index, top), roomBelow(paragraphs, index)];
  const fitting = rooms.filter((room) => room > 0);
  return Math.max(line.sizePt, Math.min(paragraph.leadingPt, ...fitting));
}

/** The pitch whose box would reach from the line to the one above, or to the row's top edge. */
function roomAbove(paragraphs: readonly TextParagraph[], index: number, top: number): number {
  const baseline = paragraphs[index]?.lines[0]?.baseline ?? 0;
  const above = paragraphs[index - 1]?.lines.at(-1)?.baseline;
  return above === undefined ? (top - baseline) / BASELINE_SHARE : above - baseline;
}

function roomBelow(paragraphs: readonly TextParagraph[], index: number): number {
  const baseline = paragraphs[index]?.lines[0]?.baseline ?? 0;
  const below = paragraphs[index + 1]?.lines[0]?.baseline;
  return below === undefined ? Number.POSITIVE_INFINITY : baseline - below;
}

/**
 * Space-before for each of a cell's paragraphs, the first measured from the
 * row's top rule — the same arithmetic settlePage does down the page, so a
 * caption's second line sits where the PDF had it rather than hard against
 * the line above.
 */
function settle(paragraphs: readonly TextParagraph[], top: number): void {
  const pitches = paragraphs.map((_paragraph, index) => ownPitch(paragraphs, index, top));
  let previousBottom = top;
  paragraphs.forEach((paragraph, index) => {
    paragraph.leadingPt = pitches[index] ?? paragraph.leadingPt;
    const first = paragraph.lines[0]?.baseline ?? 0;
    const last = paragraph.lines.at(-1)?.baseline ?? 0;
    const boxTop = first + BASELINE_SHARE * paragraph.leadingPt;
    paragraph.spaceBeforePt = Math.max(0, previousBottom - boxTop);
    previousBottom = last - (1 - BASELINE_SHARE) * paragraph.leadingPt;
  });
}

/**
 * A cell's lines as Word paragraphs — one paragraph per line, which is the
 * one place in this export that does NOT flow lines together. A caption cell's
 * lines are not a paragraph that happens to wrap: "MARGARET OKONKWO-REYES, an
 * individual," / "Plaintiff," / "vs." are discrete lines a filing sets where
 * it sets them, and a cell is narrow enough that Word rewraps a joined pair
 * onto one line and loses the second. Each line keeps its own alignment and
 * indent inside the cell, and its own place down it. An empty cell still needs
 * a paragraph: Word refuses a cell without one.
 */
function cellParagraphs(build: Build, row: number, column: number): DocxParagraph[] {
  const cell = build.table.cells[row]?.[column] ?? { lines: [] };
  const breaks = build.pageBreakBefore && row === 0 && column === 0;
  if (cell.lines.length === 0) return [new DocxParagraph({ pageBreakBefore: breaks })];
  const frame = cellFrame(build, cell, column);
  // A cell's line may run to the cell's edge: held to its own width plus a hair,
  // a line that reached the rule wraps its last word in Word and drops the cell.
  // Each line is its own paragraph on the cell's own pitch (the gap between its
  // lines): a lone line handed 1.2 × its size sits a couple of points low, and
  // every line after it in the cell a little lower still.
  const leadingPt = cell.lines.length > 1 ? medianLeading(cell.lines) : undefined;
  const paragraphs = cell.lines.flatMap((line) =>
    paragraphsOf([line], {
      frame,
      fullWidth: true,
      ...(leadingPt === undefined ? {} : { leadingPt }),
    })
  );
  const ruled = build.table.borders.horizontal[row]?.[column] === true;
  const top = edge(build.table.rowEdges, row) - (ruled ? BORDER_PT : 0);
  settle(paragraphs, top);
  // Typed lines are where the PDF set them; only a scan's rounding is taken up.
  if (isRecognized(cell)) fitToRow(paragraphs, top, edge(build.table.rowEdges, row + 1));
  return paragraphs.map((paragraph, index) =>
    docxTextParagraph(paragraph, build.fonts, { pageBreakBefore: breaks && index === 0 })
  );
}

function tableCell(build: Build, row: number, column: number): DocxTableCell {
  const { columnEdges } = build.table;
  const cell = build.table.cells[row]?.[column] ?? { lines: [] };
  return new DocxTableCell({
    width: {
      size: twips(edge(columnEdges, column + 1) - edge(columnEdges, column)),
      type: WidthType.DXA,
    },
    margins: {
      marginUnitType: WidthType.DXA,
      top: 0,
      bottom: 0,
      left: twips(build.inset),
      right: twips(rightInset(build, cell, column)),
    },
    borders: bordersAt(build.table.borders, row, column),
    children: cellParagraphs(build, row, column),
  });
}

function tableRow(build: Build, row: number): TableRow {
  const { rowEdges, columnEdges } = build.table;
  // Word adds the table's drawn bottom border to its last row: left in,
  // everything under the table sits half a point low (measured in real Word).
  const ruledBelow =
    row === rowEdges.length - 2 &&
    build.table.borders.horizontal[row + 1]?.some((drawn) => drawn) === true;
  const height = Math.max(
    1,
    edge(rowEdges, row) - edge(rowEdges, row + 1) - (ruledBelow ? BORDER_PT : 0)
  );
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

/**
 * The intermediate shapes between a page's raw layout (shared/layout-model.ts,
 * what pdfjs saw) and a Word document (what the attorney edits). Every pass in
 * this directory is a pure function from one of these to the next, which is
 * what lets the reconstruction be unit tested on hand-built pages.
 *
 * Coordinates stay in PDF points, origin bottom-left, until build-docx.ts
 * converts them to twips at the very end.
 */

import type { LayoutImage } from '@shared/types';

/** A run of text set in one style. Adjacent same-style runs are merged. */
export interface StyledRun {
  text: string;
  /** Key into the page's `fonts` map. */
  fontKey: string;
  sizePt: number;
  /** Six hex digits, no '#'. */
  colorHex: string;
  underline: boolean;
  /** Text render mode 3 — an OCR layer under a scan. Kept, but it says the page is a scan. */
  hidden: boolean;
  /** A footnote reference or ordinal, raised and small; Word draws it as superscript. */
  superscript?: boolean;
}

/** One column of a line. Nearly every line has exactly one. */
export interface Cell {
  /** Left edge of the cell's first glyph. */
  x: number;
  /** Right edge of the cell's last glyph. */
  right: number;
  runs: StyledRun[];
  /** The cell was reached across a row of dots (a table of contents entry's page number). */
  leader?: 'dot';
}

/** A tab stop, measured from the section's left margin. */
export interface TabStop {
  positionPt: number;
  align: 'left' | 'right';
  leader?: 'dot';
}

export interface Line {
  cells: Cell[];
  baseline: number;
  /** Left edge of the first glyph. */
  x: number;
  /** Right edge of the last glyph. */
  right: number;
  /** The size most of the line's characters are set in. */
  sizePt: number;
  /** The tagged PDF's paragraph the line belongs to; null when untagged or mixed. */
  blockId: string | null;
}

export type Alignment = 'left' | 'center' | 'right' | 'justify';

/**
 * The edges paragraphs are measured against. `left` and `right` are Word's
 * margins (what a centred heading is centred between, what a right indent is
 * measured from); `textRight` is where the body text actually reached, which
 * is what tells a short last line from a full one on a page — a transcript's
 * ragged lines stop far short of the page's right margin on every line.
 */
export interface BodyFrame {
  left: number;
  right: number;
  textRight: number;
}

export interface TextParagraph {
  kind: 'text';
  lines: Line[];
  alignment: Alignment;
  /** Baseline-to-baseline distance, points. */
  leadingPt: number;
  indentLeftPt: number;
  indentRightPt: number;
  /** Positive: first line indented. Negative: hanging indent (first line outdented). */
  firstLinePt: number;
  spaceBeforePt: number;
  /** Tab stops, when the lines read as columns. */
  tabStops: TabStop[];
  /** Baseline of the first line — ordering key against images. */
  top: number;
  /** First paragraph of a page's second column. */
  columnBreakBefore?: boolean;
  /** An empty line standing in for space Word would drop; never a numbered line. */
  spacer?: boolean;
}

export interface ImageParagraph {
  kind: 'image';
  image: LayoutImage;
  /** Size to draw at, points, after fitting inside the body frame. */
  widthPt: number;
  heightPt: number;
  alignment: Alignment;
  /** Where a left-aligned picture sits from the frame's left edge. */
  indentLeftPt: number;
  spaceBeforePt: number;
  top: number;
  columnBreakBefore?: boolean;
}

/** One cell of a ruled table: the lines that fell inside it, in reading order. */
export interface TableCell {
  lines: Line[];
}

/** Which of a table grid's edges were actually drawn on the page. */
export interface TableBorders {
  /** `horizontal[r][c]`: the edge ABOVE cell (r, c) is drawn; r runs 0..rows, so r = rows is the bottom edge. */
  horizontal: boolean[][];
  /** `vertical[r][c]`: the edge LEFT of cell (r, c) is drawn; c runs 0..columns, so c = columns is the right edge. */
  vertical: boolean[][];
}

/**
 * A ruled table rebuilt from the page's rule grid — a caption box, a proof of
 * service, a fee schedule. Built by tables.ts, written by docx-table.ts.
 */
export interface TableParagraph {
  kind: 'table';
  /** Column edges, points from the frame's left edge, ascending; one more than the columns. */
  columnEdges: number[];
  /** Row edges, PDF y, descending (top row first); one more than the rows. */
  rowEdges: number[];
  /** rows × columns. */
  cells: TableCell[][];
  borders: TableBorders;
  spaceBeforePt: number;
  /** Top edge, PDF y — ordering key against the other paragraphs. */
  top: number;
  /** Bottom edge, PDF y. */
  bottom: number;
  columnBreakBefore?: boolean;
}

/**
 * Where Word puts the baseline inside an "exactly N" line box: 80% of the way
 * down, whatever the face or size. Measured against real Word (2026-09-15):
 * Times 11pt on a 24pt pitch, 16pt on 28pt, and 9pt on 10.8pt all sat at
 * 0.8 × pitch below the box top, within a quarter point.
 */
export const BASELINE_SHARE = 0.8;

export type Paragraph = TextParagraph | ImageParagraph | TableParagraph;

/** Points → twips (1/20 pt), the unit OOXML measures nearly everything in. */
export function twips(points: number): number {
  return Math.round(points * 20);
}

/** Points → the CSS pixels the docx package sizes images in (96 per inch). */
export function pixels(points: number): number {
  return Math.round((points * 96) / 72);
}

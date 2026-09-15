/**
 * Columns of text with no grid drawn round them — a fee schedule set with
 * spaces, a caption block held apart by a column of ")" — become tab stops,
 * which is how a typist would have set them and how they stay editable.
 *
 * Columns WITH a grid drawn round them become real Word tables. The grid comes
 * from the page's rules (table-grid.ts); this pass decides which lines fall in
 * which cell, and refuses the whole grid rather than guess: text that crosses a
 * vertical rule, or begins outside the box and ends inside it, means the rules
 * were never a table and every line stays in the ordinary flow.
 *
 * A table's x's are all measured from the body frame's left edge — the cells'
 * lines exactly as `columnEdges` is — so docx-table.ts can lay a cell out
 * without being handed the page frame. Baselines stay page y, as `rowEdges`
 * does.
 */

import type { LayoutRule } from '@shared/types';
import { BASELINE_SHARE } from './model';
import type { BodyFrame, Line, TableCell, TableParagraph } from './model';
import { medianLeading } from './paragraphs';
import type { Edge, Grid } from './table-grid';
import { edgesIn, gridsOf, outerSpan, reaches } from './table-grid';

export interface RuledTables {
  tables: TableParagraph[];
  /** The lines that landed inside a table — they leave the paragraph flow. */
  consumed: ReadonlySet<Line>;
}

/** Text within this many points of an edge is inside it. */
const EDGE_SLACK = 2;
/**
 * How far outside the frame a grid may reach and still belong to it. A caption
 * box is ruled a few points outside the text it holds; a table that overhangs
 * by more than this belongs to another column of the page, not this one.
 */
const FRAME_SLACK = 18;
/** An average Latin character is about half an em wide. */
const HALF_EM = 0.5;
/**
 * lines.ts only starts a new cell where the gap ran wider than a couple of
 * ems (its COLUMN_GAP), so a cell's text certainly ends at least that far
 * before the next cell begins. Kept a shade under COLUMN_GAP so it stays a
 * bound whatever that is tuned to.
 */
const GAP_EMS = 2;

/**
 * Where a cell's text ends. Exact for the line's last cell (the line knows its
 * own right edge); before that it is the narrower of what the characters
 * measure and where the column gap proves the text had stopped — enough to
 * tell text that crosses a vertical rule from text that stops short of one.
 */
function cellRight(line: Line, index: number): number {
  const cell = line.cells[index];
  if (cell === undefined) return line.x;
  const next = line.cells[index + 1];
  if (next === undefined) return line.right;
  const width = cell.runs.reduce((sum, run) => sum + run.text.length * run.sizePt * HALF_EM, 0);
  const gap = GAP_EMS * (next.runs[0]?.sizePt ?? line.sizePt);
  return Math.max(cell.x, Math.min(cell.x + width, next.x - gap));
}

type Placement = number | 'outside' | 'straddles';

function columnAt(edges: readonly number[], from: number, to: number): Placement {
  if (to <= (edges[0] ?? 0) + EDGE_SLACK) return 'outside';
  if (from >= (edges.at(-1) ?? 0) - EDGE_SLACK) return 'outside';
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const left = edges[index] ?? 0;
    const right = edges[index + 1] ?? 0;
    if (from >= left - EDGE_SLACK && to <= right + EDGE_SLACK) return index;
  }
  return 'straddles';
}

/** The row whose band holds the baseline, or null when the line is above or below the grid. */
function rowAt(rowEdges: readonly number[], baseline: number): number | null {
  if (baseline > (rowEdges[0] ?? 0) + EDGE_SLACK) return null;
  if (baseline <= (rowEdges.at(-1) ?? 0) - EDGE_SLACK) return null;
  for (let index = 0; index + 1 < rowEdges.length; index += 1) {
    if (baseline > (rowEdges[index + 1] ?? 0)) return index;
  }
  return rowEdges.length - 2;
}

/** One column's worth of a line, x measured from the frame's left edge. */
function subLine(line: Line, indices: readonly number[], left: number): Line {
  const first = indices[0] ?? 0;
  const last = indices.at(-1) ?? 0;
  return {
    cells: indices.flatMap((index) => {
      const cell = line.cells[index];
      return cell === undefined ? [] : [{ ...cell, x: cell.x - left }];
    }),
    baseline: line.baseline,
    x: (line.cells[first]?.x ?? line.x) - left,
    right: cellRight(line, last) - left,
    sizePt: line.sizePt,
    blockId: line.blockId,
  };
}

interface Split {
  column: number;
  line: Line;
}

/** The line's cells sorted into grid columns; 'straddles' kills the grid. */
function splitLine(
  line: Line,
  edges: readonly number[],
  left: number
): Split[] | 'straddles' | null {
  const byColumn = new Map<number, number[]>();
  let outside = 0;
  for (let index = 0; index < line.cells.length; index += 1) {
    const where = columnAt(edges, line.cells[index]?.x ?? 0, cellRight(line, index));
    if (where === 'straddles') return 'straddles';
    if (where === 'outside') outside += 1;
    else byColumn.set(where, [...(byColumn.get(where) ?? []), index]);
  }
  if (byColumn.size === 0) return null;
  // Half inside the box and half outside it is not a table row.
  if (outside > 0) return 'straddles';
  return [...byColumn].map(([column, indices]) => ({ column, line: subLine(line, indices, left) }));
}

function emptyCells(rows: number, columns: number): TableCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ lines: [] as Line[] }))
  );
}

function tableOf(grid: Grid, cells: TableCell[][], frame: BodyFrame): TableParagraph {
  return {
    kind: 'table',
    columnEdges: grid.columnEdges.map((edge) => edge - frame.left),
    rowEdges: [...grid.rowEdges],
    cells,
    borders: grid.borders,
    spaceBeforePt: 0,
    top: grid.rowEdges[0] ?? 0,
    bottom: grid.rowEdges.at(-1) ?? 0,
  };
}

interface Filled {
  table: TableParagraph;
  consumed: Line[];
}

/** The grid with its lines in their cells, or null when it is not a table after all. */
function fill(grid: Grid, lines: readonly Line[], frame: BodyFrame): Filled | null {
  const cells = emptyCells(grid.rowEdges.length - 1, grid.columnEdges.length - 1);
  const consumed: Line[] = [];
  for (const line of lines) {
    const row = rowAt(grid.rowEdges, line.baseline);
    if (row === null) continue;
    const split = splitLine(line, grid.columnEdges, frame.left);
    if (split === 'straddles') return null;
    if (split === null) continue;
    for (const part of split) cells[row]?.[part.column]?.lines.push(part.line);
    consumed.push(line);
  }
  // A grid that caught no text is a border, a logo box, a form — not a table.
  if (consumed.length === 0) return null;
  return { table: tableOf(grid, cells, frame), consumed };
}

/**
 * The commonest California caption box is not a box at all: one vertical rule
 * between the parties and the case number, and one rule under the LEFT cell
 * only — an L. There is no closed grid to find, so the text is the evidence:
 * a rule with a column of lines running down BOTH sides of it, for its whole
 * height, closed at the foot. Fewer lines than this and it is a stray mark.
 */
const MIN_CAPTION_LINES = 6;
/** How near the foot rule has to come to the end of the upright one. */
const MEETS = 3;
/** Air between the caption's text and the edges its rules never drew. */
const CAPTION_AIR = 2;
/** No cell of a caption is narrower than an em. */
const MIN_CAPTION_CELL = 12;

function sideCount(lines: readonly Line[], test: (x: number) => boolean): number {
  return lines.filter((line) => line.cells.some((cell) => test(cell.x))).length;
}

/** The top of the text, the way settlePage measures a paragraph's box. */
function textTop(lines: readonly Line[]): number {
  const leading = medianLeading(lines);
  return Math.max(...lines.map((line) => line.baseline + BASELINE_SHARE * leading));
}

function captionAt(rule: Edge, feet: readonly Edge[], lines: readonly Line[], frame: BodyFrame) {
  const span = outerSpan(rule);
  const foot = feet.find((edge) => {
    const reach = outerSpan(edge);
    return (
      Math.abs(edge.at - span.from) <= MEETS && reach.from <= rule.at && reach.to >= rule.at - MEETS
    );
  });
  if (foot === undefined) return null;
  const inside = lines.filter((line) => line.baseline > foot.at && line.baseline <= span.to);
  if (sideCount(inside, (x) => x < rule.at) < MIN_CAPTION_LINES) return null;
  if (sideCount(inside, (x) => x > rule.at) < MIN_CAPTION_LINES) return null;
  const left = Math.min(frame.left, Math.min(...inside.map((line) => line.x)) - CAPTION_AIR);
  const right = Math.max(...inside.map((line) => line.right)) + CAPTION_AIR;
  if (rule.at - left < MIN_CAPTION_CELL || right - rule.at < MIN_CAPTION_CELL) return null;
  return {
    columnEdges: [left, rule.at, right],
    rowEdges: [Math.max(span.to, textTop(inside)), foot.at],
    borders: {
      // Only the upright rule and the foot under the left cell were drawn,
      // unless the foot runs on under the right cell too.
      horizontal: [
        [false, false],
        [true, reaches(foot, rule.at, right)],
      ],
      vertical: [[false, true, false]],
    },
  };
}

/** The caption box drawn as an L, or null when these rules are not one. */
function captionGridOf(
  rules: readonly LayoutRule[],
  lines: readonly Line[],
  frame: BodyFrame
): Grid | null {
  const { horizontal, vertical } = edgesIn(rules);
  for (const rule of vertical) {
    const grid = captionAt(rule, horizontal, lines, frame);
    if (grid !== null) return grid;
  }
  return null;
}

/** A grid belongs to the column of the page it sits in, and to no other. */
function insideFrame(grid: Grid, frame: BodyFrame): boolean {
  return (
    (grid.columnEdges[0] ?? 0) >= frame.left - FRAME_SLACK &&
    (grid.columnEdges.at(-1) ?? 0) <= frame.right + FRAME_SLACK
  );
}

/**
 * Ruled tables on the page, rebuilt from the rule grid: rows where horizontal
 * rules run, columns where vertical rules run, each line in the cell it sits
 * in. Lines the tables took are reported so the caller can drop them from the
 * paragraph flow.
 */
export function ruledTablesOf(
  lines: readonly Line[],
  rules: readonly LayoutRule[],
  frame: BodyFrame
): RuledTables {
  const tables: TableParagraph[] = [];
  const consumed = new Set<Line>();
  for (const grid of gridsOf(rules, (drawing) => captionGridOf(drawing, lines, frame))) {
    if (!insideFrame(grid, frame)) continue;
    const filled = fill(grid, lines, frame);
    if (filled === null) continue;
    tables.push(filled.table);
    for (const line of filled.consumed) consumed.add(line);
  }
  return { tables, consumed };
}

/** Cell edges closer than this are the same tab stop. */
const SAME_STOP = 4;

/** Every cell boundary after the first, from the frame's left edge, merged within SAME_STOP. */
export function tabStopsOf(lines: readonly Line[], frame: BodyFrame): number[] {
  const edges = lines
    .flatMap((line) => line.cells.slice(1).map((cell) => cell.x - frame.left))
    .filter((edge) => edge > 0)
    .sort((a, b) => a - b);
  const stops: number[] = [];
  for (const edge of edges) {
    const last = stops.at(-1);
    if (last === undefined || edge - last > SAME_STOP) stops.push(edge);
  }
  return stops;
}

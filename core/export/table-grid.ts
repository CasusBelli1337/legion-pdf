/**
 * The grid a ruled table is drawn on, read back off the page's rules.
 *
 * A PDF says nothing about tables. A caption box, a proof of service, a fee
 * schedule are each a handful of thin filled rectangles that happen to cross.
 * This pass finds where they cross — horizontal rules sharing an x-span,
 * vertical rules sharing a y-span — and reports the edges together with WHICH
 * of them were actually drawn, so a three-sided California caption box comes
 * out three-sided instead of boxed in.
 *
 * Rules are grouped into touching sets first: one table's borders all meet at
 * their corners, while the underline beneath a signature line touches nothing.
 * So a page can carry two tables and a dozen underlines without any of them
 * polluting the others.
 *
 * Coordinates are the page's own, PDF points, origin bottom-left.
 */

import type { LayoutRule, PdfRect } from '@shared/types';
import type { TableBorders } from './model';

/** Rules within this many points of each other are the same edge. */
const SAME_EDGE = 2;
/** Thicker than this is a filled panel, not a drawn line. */
const MAX_THICKNESS = 3;
/** Shorter than this is a tick or a bullet, not an edge of anything. */
const MIN_LENGTH = 8;
/** A rule has to cover this much of the edge it claims before it counts as drawn. */
const COVERAGE = 0.8;
/** Fewer than this many edges either way is not a table: 2 rows × 2 columns is the floor. */
const MIN_EDGES = 3;

interface Span {
  from: number;
  to: number;
}

/** One rule reduced to a position (y for a horizontal, x for a vertical) and its reach. */
interface Mark {
  at: number;
  span: Span;
}

/** A line of the grid: where it sits, and the stretches of it actually drawn. */
interface Edge {
  at: number;
  spans: Span[];
}

export interface Grid {
  /** Column edges, page x, ascending; one more than the columns. */
  columnEdges: number[];
  /** Row edges, page y, DESCENDING — the top row's top edge first. */
  rowEdges: number[];
  borders: TableBorders;
}

function marksOf(rules: readonly LayoutRule[]): { horizontal: Mark[]; vertical: Mark[] } {
  const horizontal: Mark[] = [];
  const vertical: Mark[] = [];
  for (const { rect } of rules) {
    if (rect.height <= MAX_THICKNESS && rect.width >= MIN_LENGTH) {
      horizontal.push({
        at: rect.y + rect.height / 2,
        span: { from: rect.x, to: rect.x + rect.width },
      });
    } else if (rect.width <= MAX_THICKNESS && rect.height >= MIN_LENGTH) {
      vertical.push({
        at: rect.x + rect.width / 2,
        span: { from: rect.y, to: rect.y + rect.height },
      });
    }
  }
  return { horizontal, vertical };
}

/** Overlapping or all-but-touching stretches joined; a line broken at a crossing is one line. */
function mergeSpans(spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last !== undefined && span.from <= last.to + SAME_EDGE)
      last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

/** Marks clustered into edges by position, ascending. */
function edgesOf(marks: readonly Mark[]): Edge[] {
  const edges: Edge[] = [];
  for (const mark of [...marks].sort((a, b) => a.at - b.at)) {
    const last = edges.at(-1);
    if (last !== undefined && mark.at - last.at <= SAME_EDGE) last.spans.push(mark.span);
    else edges.push({ at: mark.at, spans: [mark.span] });
  }
  return edges.map((edge) => ({ at: edge.at, spans: mergeSpans(edge.spans) }));
}

/** How much of [from, to] this edge actually draws. */
function covered(edge: Edge, from: number, to: number): number {
  return edge.spans.reduce(
    (sum, span) => sum + Math.max(0, Math.min(span.to, to) - Math.max(span.from, from)),
    0
  );
}

function reaches(edge: Edge, from: number, to: number): boolean {
  return to > from && covered(edge, from, to) >= COVERAGE * (to - from);
}

/** True when an edge at this position draws [from, to] — what `borders` records. */
function drawn(edges: readonly Edge[], at: number, from: number, to: number): boolean {
  const edge = edges.find((candidate) => Math.abs(candidate.at - at) <= SAME_EDGE);
  return edge !== undefined && reaches(edge, from, to);
}

/** The longest edge — a table's top or bottom border, which is what sets its width. */
function widestEdge(edges: readonly Edge[]): Edge | undefined {
  const length = (edge: Edge) => outerSpan(edge).to - outerSpan(edge).from;
  return [...edges].sort((a, b) => length(b) - length(a))[0];
}

function outerSpan(edge: Edge): Span {
  return { from: edge.spans[0]?.from ?? 0, to: edge.spans.at(-1)?.to ?? 0 };
}

/** Distinct positions, ascending, merged within SAME_EDGE. */
function distinct(positions: readonly number[]): number[] {
  const out: number[] = [];
  for (const position of [...positions].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last === undefined || position - last > SAME_EDGE) out.push(position);
  }
  return out;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The box's own sides plus every vertical rule that runs its full height. A
 * caption box open on the left still has two column edges from the horizontal
 * rules; `borders` is what says the left one was never drawn.
 */
function columnEdgesOf(verticals: readonly Edge[], box: Box): number[] {
  const inside = verticals.filter(
    (edge) =>
      edge.at >= box.left - SAME_EDGE &&
      edge.at <= box.right + SAME_EDGE &&
      reaches(edge, box.bottom, box.top)
  );
  return distinct([box.left, box.right, ...inside.map((edge) => edge.at)]);
}

function bordersOf(
  horizontals: readonly Edge[],
  verticals: readonly Edge[],
  columnEdges: readonly number[],
  rowEdges: readonly number[]
): TableBorders {
  const columns = columnEdges.length - 1;
  const rows = rowEdges.length - 1;
  const at = (edges: readonly number[], index: number) => edges[index] ?? 0;
  return {
    horizontal: Array.from({ length: rows + 1 }, (_row, r) =>
      Array.from({ length: columns }, (_column, c) =>
        drawn(horizontals, at(rowEdges, r), at(columnEdges, c), at(columnEdges, c + 1))
      )
    ),
    vertical: Array.from({ length: rows }, (_row, r) =>
      Array.from({ length: columns + 1 }, (_column, c) =>
        drawn(verticals, at(columnEdges, c), at(rowEdges, r + 1), at(rowEdges, r))
      )
    ),
  };
}

/** One touching set of rules as a grid, or null when they do not make a table. */
export function gridOf(rules: readonly LayoutRule[]): Grid | null {
  const marks = marksOf(rules);
  const horizontals = edgesOf(marks.horizontal);
  const verticals = edgesOf(marks.vertical);
  const seed = widestEdge(horizontals);
  if (seed === undefined) return null;
  const { from: left, to: right } = outerSpan(seed);
  const rows = horizontals.filter((edge) => reaches(edge, left, right));
  if (rows.length < MIN_EDGES) return null;
  const rowEdges = rows.map((edge) => edge.at).sort((a, b) => b - a);
  const box: Box = { left, right, top: rowEdges[0] ?? 0, bottom: rowEdges.at(-1) ?? 0 };
  const columnEdges = columnEdgesOf(verticals, box);
  if (columnEdges.length < MIN_EDGES) return null;
  return {
    columnEdges,
    rowEdges,
    borders: bordersOf(horizontals, verticals, columnEdges, rowEdges),
  };
}

/** Two rules whose boxes meet — the corner of a border, or a crossing. */
function touches(a: PdfRect, b: PdfRect): boolean {
  return (
    a.x - SAME_EDGE <= b.x + b.width &&
    b.x - SAME_EDGE <= a.x + a.width &&
    a.y - SAME_EDGE <= b.y + b.height &&
    b.y - SAME_EDGE <= a.y + a.height
  );
}

/** Everything in `remaining` that touches the group, transitively, moved into it. */
function absorb(group: LayoutRule[], remaining: LayoutRule[]): void {
  for (let index = 0; index < group.length; index += 1) {
    const current = group[index];
    if (current === undefined) continue;
    for (let other = remaining.length - 1; other >= 0; other -= 1) {
      const candidate = remaining[other];
      if (candidate !== undefined && touches(current.rect, candidate.rect)) {
        group.push(candidate);
        remaining.splice(other, 1);
      }
    }
  }
}

/** The page's rules split into touching sets: one drawing each. */
export function componentsOf(rules: readonly LayoutRule[]): LayoutRule[][] {
  const remaining = [...rules];
  const groups: LayoutRule[][] = [];
  while (remaining.length > 0) {
    const seed = remaining.pop();
    if (seed === undefined) break;
    const group = [seed];
    absorb(group, remaining);
    groups.push(group);
  }
  return groups;
}

/** Every ruled grid on the page, top of the page first. */
export function gridsOf(rules: readonly LayoutRule[]): Grid[] {
  return componentsOf(rules)
    .map(gridOf)
    .filter((grid): grid is Grid => grid !== null)
    .sort((a, b) => (b.rowEdges[0] ?? 0) - (a.rowEdges[0] ?? 0));
}

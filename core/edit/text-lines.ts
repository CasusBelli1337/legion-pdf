/**
 * From placed glyphs to the paragraph the attorney clicked.
 *
 * The walker says where every glyph is; this decides which glyphs make a line,
 * which lines make a paragraph, and how that paragraph is aligned — the facts
 * an edit has to preserve so a rewritten paragraph sits where the old one did.
 *
 * Everything is measured in the text's OWN frame ("along" the baseline and
 * "across" it), so a paragraph on a sideways scan is the same arithmetic as an
 * upright one. Pure: no PDF objects, only numbers, so the rules are unit tested
 * on synthetic glyphs.
 */

import type { PdfPoint, TextAlignment } from '@shared/types';
import type { ScanResult, ShownGlyph } from './text-runs';

export interface PlacedGlyph extends ShownGlyph {
  /** Index of the show operation in the scan, and of the glyph within it. */
  show: number;
  item: number;
  index: number;
  fontName: string;
  size: number;
  fillColor: string;
  renderMode: number;
  /** Text direction in radians (0 = left to right, upright). */
  angle: number;
}

/** A glyph's baseline start, in the text frame. */
export interface FramePoint {
  along: number;
  across: number;
}

export interface TextLine {
  glyphs: PlacedGlyph[];
  /** Baseline position across the text direction. */
  baseline: number;
  /** Start and end along the text direction. */
  start: number;
  end: number;
  size: number;
  fontName: string;
  text: string;
}

/** Gap between glyphs that reads as a word space, as a share of the size. */
const WORD_GAP = 0.18;
/** How far off a baseline a glyph may sit and still be on that line. */
const LINE_TOLERANCE = 0.35;
/** Baseline gaps above this many sizes are a paragraph break, not a line. */
const MAX_LEADING = 2.25;
/** How closely edges must agree to count as aligned, in points. */
const EDGE_TOLERANCE = 1.5;
/**
 * A gap this many sizes wide along one baseline is a gutter, not a space: the
 * margin between a pleading's line numbers and its text, or between two
 * columns. Each side becomes its own line.
 */
const COLUMN_GAP = 1.6;

export function angleOf(matrix: readonly number[]): number {
  return Math.atan2(matrix[1] ?? 0, matrix[0] ?? 1);
}

/** Every glyph a scan placed, flattened with the state it was drawn under. */
export function placedGlyphs(scan: ScanResult): PlacedGlyph[] {
  const glyphs: PlacedGlyph[] = [];
  scan.shows.forEach((show, showIndex) => {
    const angle = angleOf(show.matrix);
    show.items.forEach((item, itemIndex) => {
      if (item.kind !== 'glyphs') return;
      item.glyphs.forEach((glyph, index) => {
        glyphs.push({
          ...glyph,
          show: showIndex,
          item: itemIndex,
          index,
          fontName: show.fontName,
          size: show.size,
          fillColor: show.fillColor,
          renderMode: show.renderMode,
          angle,
        });
      });
    });
  });
  return glyphs;
}

/** User space → the frame of text running at `angle`. */
export function toFrame(point: PdfPoint, angle: number): FramePoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { along: point.x * cos + point.y * sin, across: -point.x * sin + point.y * cos };
}

/** The frame → user space. */
export function fromFrame(point: FramePoint, angle: number): PdfPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.along * cos - point.across * sin, y: point.along * sin + point.across * cos };
}

function sameAngle(first: number, second: number): boolean {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second))) < 0.02;
}

type Decode = (glyph: PlacedGlyph) => string;

function lineText(glyphs: readonly PlacedGlyph[], angle: number, decode: Decode): string {
  let text = '';
  let penEnd: number | null = null;
  for (const glyph of glyphs) {
    const start = toFrame(glyph.origin, angle).along;
    const character = decode(glyph);
    const gap = penEnd === null ? 0 : start - penEnd;
    if (
      penEnd !== null &&
      gap > WORD_GAP * glyph.size &&
      !text.endsWith(' ') &&
      character !== ' '
    ) {
      text += ' ';
    }
    text += character;
    penEnd = start + glyph.advance;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Lines of text running at `angle`, top to bottom. A glyph joins a line when it
 * sits on that line's baseline; invisible (mode 3) and clipping (mode 7) text is
 * not a line anyone can see, so it is left out.
 */
export function groupLines(
  glyphs: readonly PlacedGlyph[],
  angle: number,
  decode: Decode
): TextLine[] {
  const visible = glyphs.filter(
    (glyph) =>
      glyph.renderMode !== 3 &&
      glyph.renderMode !== 7 &&
      sameAngle(glyph.angle, angle) &&
      glyph.size > 0
  );
  const placed = visible.map((glyph) => ({ glyph, at: toFrame(glyph.origin, angle) }));
  placed.sort(
    (first, second) => second.at.across - first.at.across || first.at.along - second.at.along
  );
  const lines: { glyphs: PlacedGlyph[]; baseline: number; size: number }[] = [];
  for (const { glyph, at } of placed) {
    const line = lines.find(
      (candidate) =>
        Math.abs(candidate.baseline - at.across) <=
        LINE_TOLERANCE * Math.max(candidate.size, glyph.size)
    );
    if (line === undefined) lines.push({ glyphs: [glyph], baseline: at.across, size: glyph.size });
    else line.glyphs.push(glyph);
  }
  return lines.flatMap((line) => {
    const ordered = [...line.glyphs].sort(
      (a, b) => toFrame(a.origin, angle).along - toFrame(b.origin, angle).along
    );
    return splitAtGutters(ordered, angle).map((segment) =>
      lineOf(segment, line.baseline, angle, decode)
    );
  });
}

/** One baseline's glyphs, cut wherever a gutter separates two columns. */
function splitAtGutters(ordered: readonly PlacedGlyph[], angle: number): PlacedGlyph[][] {
  const segments: PlacedGlyph[][] = [];
  let current: PlacedGlyph[] = [];
  let penEnd: number | null = null;
  for (const glyph of ordered) {
    const start = toFrame(glyph.origin, angle).along;
    if (penEnd !== null && start - penEnd > COLUMN_GAP * glyph.size && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(glyph);
    penEnd = start + glyph.advance;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function lineOf(ordered: PlacedGlyph[], baseline: number, angle: number, decode: Decode): TextLine {
  const first = ordered[0];
  const last = ordered.at(-1);
  return {
    glyphs: ordered,
    baseline,
    start: first === undefined ? 0 : toFrame(first.origin, angle).along,
    end: last === undefined ? 0 : toFrame(last.origin, angle).along + last.advance,
    size: Math.max(...ordered.map((glyph) => glyph.size)),
    fontName: first?.fontName ?? '',
    text: lineText(ordered, angle, decode),
  };
}

/** The line the point is on (or nearest to, within a line's height), else -1. */
export function lineAt(lines: readonly TextLine[], at: FramePoint): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  lines.forEach((line, index) => {
    const above = line.baseline + line.size * 0.9;
    const below = line.baseline - line.size * 0.3;
    const vertical =
      at.across > above ? at.across - above : at.across < below ? below - at.across : 0;
    const horizontal =
      at.along < line.start ? line.start - at.along : at.along > line.end ? at.along - line.end : 0;
    const distance = Math.hypot(vertical, horizontal * 0.25);
    if (vertical <= line.size && horizontal <= line.size * 2 && distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function overlap(first: TextLine, second: TextLine): boolean {
  const shared = Math.min(first.end, second.end) - Math.max(first.start, second.start);
  return shared > 0.3 * Math.min(first.end - first.start, second.end - second.start);
}

/** Width of a line's first word: the advances up to the first word gap. */
function firstWordWidth(line: TextLine): number {
  let width = 0;
  let penEnd: number | null = null;
  for (const glyph of line.glyphs) {
    const start = toFrame(glyph.origin, glyph.angle).along;
    if (penEnd !== null && start - penEnd > WORD_GAP * glyph.size) break;
    width += glyph.advance + (penEnd === null ? 0 : Math.max(0, start - penEnd));
    penEnd = start + glyph.advance;
  }
  return width;
}

/**
 * Whether `lower` continues `upper`'s paragraph. The break test is the one
 * typesetters use: if the next line's first word would have fitted on this
 * line, the line ended on purpose, and a paragraph ends with it.
 */
function joinable(upper: TextLine, lower: TextLine, rightEdge: number): boolean {
  const gap = upper.baseline - lower.baseline;
  const size = Math.max(upper.size, lower.size);
  if (gap <= 0 || gap > MAX_LEADING * size) return false;
  if (Math.abs(upper.size - lower.size) > 0.6) return false;
  if (!overlap(upper, lower)) return false;
  const room = rightEdge - upper.end;
  return room < firstWordWidth(lower) + WORD_GAP * size + EDGE_TOLERANCE;
}

interface ColumnEntry {
  line: TextLine;
  index: number;
}

/** Walks from `at` in `step` direction while consecutive lines still join. */
function extend(
  column: readonly ColumnEntry[],
  at: number,
  step: -1 | 1,
  rightEdge: number
): number {
  let current = at;
  while (current + step >= 0 && current + step < column.length) {
    const upper = column[step < 0 ? current + step : current]?.line;
    const lower = column[step < 0 ? current : current + step]?.line;
    if (upper === undefined || lower === undefined || !joinable(upper, lower, rightEdge)) break;
    current += step;
  }
  return current;
}

/**
 * Indices of the lines that form one paragraph with line `hit`, in reading
 * order. Only lines in the SAME COLUMN are considered — a pleading's line
 * numbers and a neighbouring column share baselines with the prose without
 * being part of it.
 */
export function paragraphAround(lines: readonly TextLine[], hit: number): number[] {
  const seed = lines[hit];
  if (seed === undefined) return [];
  const column: ColumnEntry[] = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => overlap(entry.line, seed))
    .sort((a, b) => b.line.baseline - a.line.baseline);
  const rightEdge = Math.max(...column.map((entry) => entry.line.end));
  const at = column.findIndex((entry) => entry.index === hit);
  const first = extend(column, at, -1, rightEdge);
  const last = extend(column, at, 1, rightEdge);
  return column.slice(first, last + 1).map((entry) => entry.index);
}

function aligned(values: readonly number[]): boolean {
  return values.length > 0 && Math.max(...values) - Math.min(...values) <= EDGE_TOLERANCE;
}

/** How a paragraph's lines sit against its edges. Left when there is no way to tell. */
export function alignmentOf(lines: readonly TextLine[]): TextAlignment {
  if (lines.length < 2) return 'left';
  const body = lines.slice(1);
  const lefts = body.map((line) => line.start);
  const rights = lines.slice(0, -1).map((line) => line.end);
  const centers = lines.map((line) => (line.start + line.end) / 2);
  if (aligned(lefts) && aligned(rights) && lines.length > 2) return 'justify';
  if (aligned([lines[0]?.start ?? 0, ...lefts])) return 'left';
  if (aligned(lines.map((line) => line.end))) return 'right';
  if (aligned(centers)) return 'center';
  return 'left';
}

/** Median baseline-to-baseline gap; the size itself for a single line. */
export function leadingOf(lines: readonly TextLine[]): number {
  if (lines.length < 2) return lines[0]?.size ?? 0;
  const gaps = lines
    .slice(1)
    .map((line, index) => (lines[index]?.baseline ?? 0) - line.baseline)
    .sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 0;
}

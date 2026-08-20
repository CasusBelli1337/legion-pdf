/**
 * Turning "these glyphs are under the box" into new bytes for the stream.
 *
 * Two rules carry the whole rewrite:
 *
 * 1. A show operator that loses nothing is NOT touched. Its bytes stay exactly
 *    where they were, which is what lets a caller prove the rest of the page
 *    came through the edit unchanged.
 * 2. A show operator that loses glyphs is replaced by a `TJ` that keeps the
 *    survivors and puts a numeric adjustment where the removed glyphs were.
 *    That number moves the pen exactly as far as the deleted text did, so the
 *    words still standing on the same line do not slide left into the gap —
 *    deleting the operator outright is the obvious version of this and it
 *    quietly re-flows the page.
 */

import type { PdfRect } from '@shared/types';
import { overlapArea } from './matrix';
import type { ShowItem, ShowOperation, ShownGlyph } from './text-runs';

/** How much of a glyph must sit inside the box before it counts as covered. */
export const COVERAGE_THRESHOLD = 0.6;

export interface ShowEdit {
  start: number;
  end: number;
  /** Replacement text for that byte range. */
  text: string;
  /** Glyphs this edit deletes. */
  glyphsRemoved: number;
  /** String bytes this edit deletes — the figure a shown-character count moves by. */
  bytesRemoved: number;
}

/** A glyph counts as covered when enough of its own box lies inside the rect. */
export function isCovered(glyph: ShownGlyph, rect: PdfRect, threshold: number): boolean {
  const area = Math.abs(glyph.box.width * glyph.box.height);
  if (area === 0) {
    return (
      glyph.box.x >= rect.x &&
      glyph.box.x <= rect.x + rect.width &&
      glyph.box.y >= rect.y &&
      glyph.box.y <= rect.y + rect.height
    );
  }
  return overlapArea(glyph.box, rect) / area >= threshold;
}

function hexOf(glyphs: readonly ShownGlyph[], codeBytes: 1 | 2): string {
  const digits = glyphs
    .map((glyph) =>
      glyph.code
        .toString(16)
        .toUpperCase()
        .padStart(codeBytes * 2, '0')
    )
    .join('');
  return `<${digits}>`;
}

/**
 * The `TJ` number that moves the pen as far as a removed run did. A `TJ` number
 * `n` shifts by `-n/1000 * size` (the horizontal scale multiplies both sides and
 * cancels), so the advance the glyphs would have taken comes back as `-1000 *
 * advance / size`.
 */
function compensation(glyphs: readonly ShownGlyph[], size: number): number {
  if (size === 0) return 0;
  const advance = glyphs.reduce((total, glyph) => total + glyph.advance, 0);
  return Number(((-1000 * advance) / size).toFixed(4));
}

interface Split {
  parts: string[];
  glyphsRemoved: number;
  bytesRemoved: number;
}

/** Consecutive glyphs, grouped into the ones that go and the ones that stay. */
function splitGlyphs(
  glyphs: readonly ShownGlyph[],
  covered: readonly boolean[],
  operation: ShowOperation,
  split: Split
): void {
  let index = 0;
  while (index < glyphs.length) {
    const removing = covered[index] === true;
    let end = index;
    while (end < glyphs.length && (covered[end] === true) === removing) end += 1;
    const group = glyphs.slice(index, end);
    if (removing) {
      split.parts.push(String(compensation(group, operation.size)));
      split.glyphsRemoved += group.length;
      split.bytesRemoved += group.length * operation.codeBytes;
    } else {
      split.parts.push(hexOf(group, operation.codeBytes));
    }
    index = end;
  }
}

function itemParts(
  item: ShowItem,
  operation: ShowOperation,
  rect: PdfRect,
  threshold: number,
  split: Split
): void {
  if (item.kind === 'adjust') {
    split.parts.push(String(item.value));
    return;
  }
  const covered = item.glyphs.map((glyph) => isCovered(glyph, rect, threshold));
  splitGlyphs(item.glyphs, covered, operation, split);
}

/**
 * The edit one show operator needs, or null when the box covers none of it.
 * Every rewritten operator comes out as `prefix [ … ] TJ`, whatever it was
 * before: `Tj`, `TJ`, `'`, and `"` all show glyphs, and the two that also move
 * the line carry that move in the prefix so nothing about the layout changes.
 */
export function editFor(
  operation: ShowOperation,
  rect: PdfRect,
  threshold = COVERAGE_THRESHOLD
): ShowEdit | null {
  const split: Split = { parts: [], glyphsRemoved: 0, bytesRemoved: 0 };
  for (const item of operation.items) itemParts(item, operation, rect, threshold, split);
  if (split.glyphsRemoved === 0) return null;
  const body = `[${split.parts.join(' ')}] TJ`;
  return {
    start: operation.start,
    end: operation.end,
    text: operation.prefix === '' ? body : `${operation.prefix} ${body}`,
    glyphsRemoved: split.glyphsRemoved,
    bytesRemoved: split.bytesRemoved,
  };
}

/** Applies edits to a buffer, latest first so earlier offsets stay valid. */
export function applyEdits(content: Uint8Array, edits: readonly ShowEdit[]): Uint8Array {
  const ordered = [...edits].sort((first, second) => second.start - first.start);
  let result = content;
  const encoder = new TextEncoder();
  for (const edit of ordered) {
    const replacement = encoder.encode(edit.text);
    const next = new Uint8Array(result.length - (edit.end - edit.start) + replacement.length);
    next.set(result.subarray(0, edit.start), 0);
    next.set(replacement, edit.start);
    next.set(result.subarray(edit.end), edit.start + replacement.length);
    result = next;
  }
  return result;
}

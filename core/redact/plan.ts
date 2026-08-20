/**
 * Turning marks into a plan, with every way the request could be empty or
 * out of bounds checked BEFORE a single page is touched.
 *
 * The rule this file enforces: a redaction either destroys exactly what was
 * marked or it fails loudly. It never silently drops a mark it could not place,
 * because a dropped mark is a leak that looks like a success.
 */

import { RangeCollapseError } from '@shared/types';
import type { PdfRect, RedactApplyOptions, RedactionBox } from '@shared/types';
import { NoRedactionMarksError, RedactionGeometryError } from './types';

export interface RedactionPlan {
  /** 1-based pages to rebuild, ascending and deduped. */
  pages: number[];
  /** Marks per page, in PDF user space. */
  marksByPage: Map<number, PdfRect[]>;
  dpi: number;
  /** Terms the verification pass must account for in the output. */
  strings: string[];
  /** How many instances of each term were marked, keyed by the lowercased term. */
  markedInstances: Map<string, number>;
  /** Marks placed. One search hit can be several marks — see `instanceCount`. */
  markCount: number;
  /** The "N instances destroyed" of the receipt. */
  instanceCount: number;
}

function assertDpi(dpi: number): void {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new RangeError(`Redaction needs a positive DPI to rasterize at, got ${dpi}.`);
  }
}

function assertRect(box: RedactionBox): void {
  const { width, height } = box.rect;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RedactionGeometryError(
      `The mark on page ${box.page} has no area (${width} x ${height} points) — ` +
        'it would destroy nothing.'
    );
  }
}

/** Marks whose page does not exist are never dropped quietly; they stop the run. */
function assertPagesExist(boxes: readonly RedactionBox[], pageCount: number): void {
  const outside = boxes.filter(
    (box) => !Number.isInteger(box.page) || box.page < 1 || box.page > pageCount
  );
  if (outside.length === 0) return;
  const listed = [...new Set(outside.map((box) => box.page))].join(', ');
  if (outside.length === boxes.length) {
    throw new RangeCollapseError(`pages ${listed}`, pageCount);
  }
  throw new RangeError(
    `${outside.length} redaction marks name pages (${listed}) outside this ` +
      `${pageCount}-page document — nothing was changed.`
  );
}

/**
 * Every term the verify pass must account for: what the caller listed, plus the
 * text of every search hit that was marked. Deriving the second half here is
 * what stops a search-based redaction from being verified against nothing.
 */
export function verificationStrings(options: RedactApplyOptions): string[] {
  const fromMatches = options.boxes.map((box) => box.sourceMatch?.text ?? '');
  const seen = new Map<string, string>();
  for (const candidate of [...options.verifyStrings, ...fromMatches]) {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()];
}

/**
 * What the receipt calls an INSTANCE. A search hit is often several marks — a
 * text run split across pdfjs items gives one quad each — and a receipt reading
 * "6 instances destroyed" where the attorney marked two social security numbers
 * is a receipt that cannot be quoted in a declaration. Marks from the same hit
 * count once; a hand-drawn box counts as itself.
 */
export function countInstances(boxes: readonly RedactionBox[]): number {
  const hits = new Set<string>();
  let drawn = 0;
  for (const box of boxes) {
    if (box.sourceMatch === undefined) drawn += 1;
    else hits.add(`${box.sourceMatch.page}:${box.sourceMatch.index}:${box.sourceMatch.text}`);
  }
  return hits.size + drawn;
}

/**
 * How many INSTANCES of each term were marked, keyed by the lowercased term.
 *
 * This is the number that makes verification instance-scoped. The promise to
 * the attorney is that the copies they MARKED are destroyed — copies elsewhere
 * in the document were never part of the request, and failing the redaction
 * over them tells them their marked text survived when it did not. Marks from
 * the same hit count once, exactly as `countInstances` counts them.
 */
export function instancesByString(boxes: readonly RedactionBox[]): Map<string, number> {
  const hits = new Map<string, Set<string>>();
  for (const box of boxes) {
    const match = box.sourceMatch;
    if (match === undefined) continue;
    const key = match.text.trim().toLowerCase();
    if (key.length === 0) continue;
    const seen = hits.get(key) ?? new Set<string>();
    seen.add(`${match.page}:${match.index}`);
    hits.set(key, seen);
  }
  return new Map([...hits].map(([key, seen]) => [key, seen.size]));
}

function groupByPage(boxes: readonly RedactionBox[]): Map<number, PdfRect[]> {
  const marksByPage = new Map<number, PdfRect[]>();
  for (const box of boxes) {
    const existing = marksByPage.get(box.page);
    if (existing === undefined) marksByPage.set(box.page, [box.rect]);
    else existing.push(box.rect);
  }
  return marksByPage;
}

/** Validate the request and group the marks by the page they will destroy. */
export function planRedactions(options: RedactApplyOptions, pageCount: number): RedactionPlan {
  if (options.boxes.length === 0) throw new NoRedactionMarksError();
  assertDpi(options.dpi);
  assertPagesExist(options.boxes, pageCount);
  for (const box of options.boxes) assertRect(box);

  const marksByPage = groupByPage(options.boxes);
  const pages = [...marksByPage.keys()].sort((left, right) => left - right);
  return {
    pages,
    marksByPage,
    dpi: options.dpi,
    strings: verificationStrings(options),
    markedInstances: instancesByString(options.boxes),
    markCount: options.boxes.length,
    instanceCount: countInstances(options.boxes),
  };
}

/**
 * The record cite an attorney would otherwise type by hand: "(5:10-15)".
 *
 * Both halves come off the PAGE, never off the PDF. The page is the number
 * printed at the bottom — a transcript's page 5 is the file's page 7 once the
 * cover and the index are counted — and the lines are the margin numbers that
 * vertically bound the first and last lines of what was selected.
 *
 * When a page carries no line numbers the cite degrades to "(12)" rather than
 * inventing lines, and when no printed page number can be found at all there is
 * no cite: a wrong cite in a brief is worse than none.
 */

import type { CiteRange } from './contract';
import { withCitePrefix } from './cite-prefix';
import { lineNumberFor } from './line-columns';
import type { ClassifiedPage } from './page-classifier';
import { pageNumberForRegion } from './region-plan';
import { linesForPage } from './smart-text';
import type { PageSelection, SelectedLine } from './smart-text';

export type CiteConfidence = 'high' | 'low';

export interface SelectionCite {
  cite: CiteRange | null;
  /** 'low' when a printed page number had to be guessed — the menu says so. */
  confidence: CiteConfidence;
}

interface CiteAnchor {
  printed: number;
  line: number | null;
  confidence: CiteConfidence;
}

function anchorFor(page: ClassifiedPage, line: SelectedLine): CiteAnchor | null {
  const printed = pageNumberForRegion(
    page.plan,
    line.region,
    page.classification.printedPageNumber
  );
  if (printed === null) return null;
  return {
    printed,
    line: lineNumberFor(line.box, page.columns, line.region),
    confidence: page.classification.printedNumberConfidence,
  };
}

function side(page: number, line: number | null): string {
  return line === null ? `${page}` : `${page}:${line}`;
}

function bareCite(range: Omit<CiteRange, 'formatted'>): string {
  if (range.startPage !== range.endPage) {
    return `(${side(range.startPage, range.startLine)}-${side(range.endPage, range.endLine)})`;
  }
  const lines = [range.startLine, range.endLine].filter((line): line is number => line !== null);
  if (lines.length === 0) return `(${range.startPage})`;
  const low = Math.min(...lines);
  const high = Math.max(...lines);
  return low === high ? `(${range.startPage}:${low})` : `(${range.startPage}:${low}-${high})`;
}

/**
 * "(5:10-15)", "(5:10-6:2)", "(12)" — the shapes a brief actually uses, with
 * the document's own source label in front when one is set:
 * "(Rothrock Decl. 5:10-15)". `CiteRange.formatted` carries the FINAL string,
 * prefix included, so nothing downstream has to reassemble it.
 */
export function formatCite(range: Omit<CiteRange, 'formatted'>, prefix = ''): string {
  return withCitePrefix(bareCite(range), prefix);
}

function rangeFrom(start: CiteAnchor, end: CiteAnchor, prefix: string): CiteRange {
  const bare = {
    startPage: start.printed,
    startLine: start.line,
    endPage: end.printed,
    endLine: end.line,
  };
  return { ...bare, formatted: formatCite(bare, prefix) };
}

/** The first and last cited lines of one page, where both can be pinned. */
function anchorsForPage(selection: PageSelection): CiteAnchor[] {
  const lines = linesForPage(selection);
  const first = lines[0];
  const last = lines.at(-1);
  if (first === undefined || last === undefined) return [];
  return [anchorFor(selection.page, first), anchorFor(selection.page, last)].filter(
    (anchor): anchor is CiteAnchor => anchor !== null
  );
}

/**
 * The cite for a whole selection. Reading order decides which end is the start,
 * so a drag made upward or backwards still cites forwards.
 */
export function citeForSelection(pages: readonly PageSelection[], prefix = ''): SelectionCite {
  const ordered = [...pages].sort(
    (a, b) => a.page.classification.page - b.page.classification.page
  );
  const anchors = ordered.flatMap(anchorsForPage);
  const start = anchors[0];
  const end = anchors.at(-1);
  if (start === undefined || end === undefined) return { cite: null, confidence: 'low' };
  const confidence: CiteConfidence =
    start.confidence === 'high' && end.confidence === 'high' ? 'high' : 'low';
  return { cite: rangeFrom(start, end, prefix), confidence };
}

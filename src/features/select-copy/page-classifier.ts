/**
 * What every run of text on one page is FOR. Implements the classification
 * half of `contract.ts`.
 *
 * Precedence matters and is deliberate: line number, then printed page number,
 * then Bates stamp, then header/footer, and whatever is left is body. An item
 * can look like two things at once — "28" in the bottom margin is both a
 * plausible page number and the last line number — and the earlier rule wins
 * because it is the one backed by the stronger structural evidence.
 */

import type { PageClassification, TextRole } from './contract';
import type { PageSize } from '@shared/types';
import { centerX, centerY, positionItems } from './item-geometry';
import type { PositionedItem, TextItemLike } from './item-geometry';
import { findLineNumberColumns, lineNumberIndices, quadrantForPoint } from './line-columns';
import type { LineNumberColumn, Quadrant } from './line-columns';
import { findPrintedPageNumber } from './printed-page';
import type { PrintedNumber } from './printed-page';
import { planRegions } from './region-plan';
import type { RegionPlan } from './region-plan';
import { inEdgeBand, inFooterBand, inHeaderBand, normalizeBandText } from './repeated-bands';

export type { Quadrant } from './line-columns';

/** One page as the classifier wants it: pdfjs items plus the page box. */
export interface PageInput {
  /** 1-based PDF index. */
  page: number;
  items: readonly TextItemLike[];
  size: PageSize;
}

/** What only the whole document can tell you. Optional: one page still classifies. */
export interface DocumentContext {
  repeatedBandText: ReadonlySet<string>;
}

/**
 * The contract's `PageClassification` plus the geometry the smart-text and cite
 * passes need. Kept internal to this lane — the contract shape is what crosses
 * to the viewer.
 */
export interface ClassifiedPage {
  classification: PageClassification;
  size: PageSize;
  positioned: PositionedItem[];
  columns: LineNumberColumn[];
  roles: Map<number, TextRole>;
  /** Mini-page regions in reading order; `[null]` on an ordinary page. */
  regions: Quadrant[];
  /** Per-mini-page printed numbers, and their reading order. */
  plan: RegionPlan;
}

/** ASHFORD000123, ABC-000123, DEF_0001 — a prefix welded to a long number. */
export function looksLikeBates(text: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]{0,19}[ _.-]?\d{3,10}$/.test(text.trim());
}

interface RoleRules {
  lineIndices: ReadonlySet<number>;
  numberIndices: ReadonlySet<number>;
  printed: PrintedNumber;
  size: PageSize;
  repeated: ReadonlySet<string>;
  /** A condensed sheet has no page edges where its mini-pages meet. */
  multiUp: boolean;
}

/**
 * Header and footer detection is switched OFF on a condensed sheet, and that is
 * the right trade rather than a gap.
 *
 * Both tests here measure against the edges of the PAPER. On a 4-up sheet the
 * paper's top band is the first line of the two upper mini-pages and its bottom
 * band is the last line of the two lower ones — all four of them testimony. The
 * repetition test is no safer: "Page 43 line one" normalises to the same string
 * as "Page 47 line one", so every mini-page's opening line looks like a running
 * head. Losing a line of a deposition to a false positive is far worse than
 * copying a header that a condensed sheet rarely carries in the first place.
 */
function bandRole(item: PositionedItem, rules: RoleRules): TextRole | null {
  if (rules.multiUp) return null;
  const y = centerY(item.box);
  const isHeader = inHeaderBand(y, rules.size);
  const isFooter = inFooterBand(y, rules.size);
  if (!isHeader && !isFooter) return null;
  const repeats = rules.repeated.has(normalizeBandText(item.item.str));
  if (!repeats && !inEdgeBand(y, rules.size)) return null;
  return isHeader ? 'header' : 'footer';
}

function roleOf(item: PositionedItem, rules: RoleRules): TextRole {
  if (rules.lineIndices.has(item.itemIndex)) return 'line-number';
  if (rules.printed.itemIndex === item.itemIndex) return 'page-number';
  if (rules.numberIndices.has(item.itemIndex)) return 'page-number';
  const band = bandRole(item, rules);
  if (band !== null && looksLikeBates(item.item.str)) return 'stamp';
  return band ?? 'body';
}

/**
 * A condensed sheet's own "page number" is the first mini-page printed on it —
 * read straight off the paper, so it is believed outright. Everything else goes
 * through the footer heuristics.
 */
function printedNumberOf(
  positioned: readonly PositionedItem[],
  input: PageInput,
  columns: readonly LineNumberColumn[],
  plan: RegionPlan
): PrintedNumber {
  const first = plan.regions[0];
  const mini = first === undefined ? undefined : plan.numbers.get(first);
  if (plan.regions.length > 1 && mini !== undefined) {
    return { value: mini, confidence: 'high', itemIndex: null };
  }
  return findPrintedPageNumber(positioned, input.size, input.page, columns);
}

export function classifyPage(input: PageInput, context?: DocumentContext): ClassifiedPage {
  const positioned = positionItems(input.items);
  const columns = findLineNumberColumns(positioned, input.size);
  const plan = planRegions(columns, positioned, input.size);
  const printed = printedNumberOf(positioned, input, columns, plan);
  const rules: RoleRules = {
    lineIndices: lineNumberIndices(columns),
    numberIndices: plan.numberIndices,
    printed,
    size: input.size,
    repeated: context?.repeatedBandText ?? new Set<string>(),
    multiUp: plan.regions.length > 1,
  };

  const roles = new Map<number, TextRole>(
    positioned.map((item) => [item.itemIndex, roleOf(item, rules)])
  );

  return {
    classification: {
      page: input.page,
      items: [...roles].map(([itemIndex, role]) => ({ itemIndex, role })),
      printedPageNumber: printed.value,
      printedNumberConfidence: printed.confidence,
      lineNumberColumns: columns.map(({ xMin, xMax, quadrant }) => ({ xMin, xMax, quadrant })),
    },
    size: input.size,
    positioned,
    columns,
    roles,
    regions: plan.regions,
    plan,
  };
}

/** The mini-page a classified item belongs to. */
export function regionOf(page: ClassifiedPage, item: PositionedItem): Quadrant {
  const multiUp = page.regions.length > 1;
  return quadrantForPoint(centerX(item.box), centerY(item.box), page.size, multiUp);
}

/**
 * A condensed transcript sheet is four pages pretending to be one, and this is
 * the file that keeps them apart: what order they are read in, and what number
 * each one is PRINTED with.
 *
 * Both matter for the same reason. Copying a condensed sheet in DOM order
 * interleaves four unrelated pages of testimony, and citing one gets the sheet
 * (which is not a page number anybody uses) instead of transcript page 47.
 * An ordinary page falls straight through here as a single region.
 */

import type { PageSize } from '@shared/types';
import { centerX, centerY } from './item-geometry';
import type { PositionedItem } from './item-geometry';
import { quadrantForPoint } from './line-columns';
import type { LineNumberColumn, Quadrant } from './line-columns';
import { findQuadrantNumber } from './printed-page';

export interface RegionPlan {
  /** Mini-pages in reading order; `[null]` on an ordinary page. */
  regions: Quadrant[];
  /** The number printed on each mini-page, where one was found. */
  numbers: Map<Quadrant, number>;
  /** The items carrying those numbers — never copied as body. */
  numberIndices: Set<number>;
}

const SINGLE: RegionPlan = { regions: [null], numbers: new Map(), numberIndices: new Set() };

function itemsInQuadrant(
  items: readonly PositionedItem[],
  size: PageSize,
  quadrant: Quadrant
): PositionedItem[] {
  return items.filter(
    (item) => quadrantForPoint(centerX(item.box), centerY(item.box), size, true) === quadrant
  );
}

/**
 * Reading order: down the LEFT column of mini-pages, then down the right, which
 * is how a MiniScript sheet is numbered. When every mini-page carries its own
 * printed number those numbers decide instead — the sheet itself says what
 * order it is in, and no heuristic beats being told.
 */
export function planRegions(
  columns: readonly LineNumberColumn[],
  items: readonly PositionedItem[],
  size: PageSize
): RegionPlan {
  const quadrants = [...new Set(columns.map((column) => column.quadrant))];
  if (quadrants.length <= 1)
    return quadrants.length === 1 ? { ...SINGLE, regions: quadrants } : SINGLE;

  const found = quadrants.map((quadrant) => {
    const column = columns.find((candidate) => candidate.quadrant === quadrant);
    const printed =
      column === undefined
        ? null
        : findQuadrantNumber(itemsInQuadrant(items, size, quadrant), column);
    return { quadrant, printed };
  });

  const numbers = new Map<Quadrant, number>();
  const numberIndices = new Set<number>();
  for (const entry of found) {
    if (entry.printed === null) continue;
    numbers.set(entry.quadrant, entry.printed.value);
    numberIndices.add(entry.printed.itemIndex);
  }

  const byPrintedNumber = found.every((entry) => entry.printed !== null);
  const regions = byPrintedNumber
    ? found
        .sort((a, b) => (a.printed?.value ?? 0) - (b.printed?.value ?? 0))
        .map((entry) => entry.quadrant)
    : quadrants.sort((a, b) => (a ?? 0) - (b ?? 0));

  return { regions, numbers, numberIndices };
}

/**
 * The page number to cite for a region: the mini-page's own number on a
 * condensed sheet, and the sheet's printed number everywhere else.
 */
export function pageNumberForRegion(
  plan: RegionPlan,
  region: Quadrant,
  printedPageNumber: number | null
): number | null {
  return plan.numbers.get(region) ?? printedPageNumber;
}

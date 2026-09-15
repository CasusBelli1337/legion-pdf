/**
 * Page geometry: what size the paper is, where the margins fall, and which
 * consecutive pages share a Word section. Margins are READ off the body text
 * rather than assumed — a brief with 1.25" side margins gets 1.25" side margins
 * — and every page of a section is measured together, so the widest text run
 * on any page sets the section's margin and nothing is pushed onto a new line.
 */

import type { LayoutTextRun, PageLayout, PageSize } from '@shared/types';
import { columnsOf } from './columns';
import { BASELINE_SHARE } from './model';
import type { BodyFrame } from './model';
import { pleadingOf, pleadingOfSection } from './pleading';
import type { Pleading } from './pleading';

/** Points. Half an inch is the least a printer can hold; an inch is the default. */
const MIN_MARGIN = 36;
/** The right margin may be tighter: it only has to let the widest line through. */
const MIN_RIGHT_MARGIN = 18;
const DEFAULT_MARGIN = 72;
/** Vertical margins: never tighter than this, and the bottom never looser. */
const MIN_VERTICAL = 8;
const MAX_BOTTOM = 70;
/** Room left on the right so a line that filled the PDF's width never wraps in Word. */
const RIGHT_SLACK = 2;
/** Default header and footer distance from the paper's edge. */
const DEFAULT_BAND = 36;
/** Rough ascent and descent as fractions of the size, for the line box. */
const ASCENT_SHARE = 0.8;
const DESCENT_SHARE = 0.25;

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Word columns for a two-column page. Unequal on purpose: the left column is
 * as wide as its widest line and the right starts where the PDF's right column
 * started, so nothing wraps that did not wrap on the page.
 */
export interface ColumnLayout {
  count: 1 | 2;
  /** Column widths, points; one entry per column. */
  widths: number[];
  /** Space between the columns, points; zero for one column. */
  spacePt: number;
  /** Where the second column begins; the frame's left for one column. */
  secondLeft: number;
}

export interface SectionGeometry {
  /** Paper size as displayed (a /Rotate 90 page is landscape). */
  size: PageSize;
  orientation: 'portrait' | 'landscape';
  margins: Margins;
  /** Distance from the paper's top / bottom edge to the header / footer text. */
  headerPt: number;
  footerPt: number;
  frame: BodyFrame;
  columns: ColumnLayout;
  pages: PageLayout[];
  /** The numbered column every page of the section carries, or null. */
  pleading: Pleading | null;
}

interface Extents {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function pageSizeOf(layout: PageLayout): PageSize {
  const sideways = layout.rotation % 180 !== 0;
  return sideways
    ? { width: layout.size.height, height: layout.size.width }
    : { width: layout.size.width, height: layout.size.height };
}

export function bodyRuns(layout: PageLayout): LayoutTextRun[] {
  return layout.runs.filter((run) => run.role === 'body' && run.text.trim().length > 0);
}

function runsExtents(runs: readonly LayoutTextRun[]): Extents | null {
  if (runs.length === 0) return null;
  return {
    left: Math.min(...runs.map((run) => run.x)),
    right: Math.max(...runs.map((run) => run.x + run.width)),
    top: Math.max(...runs.map((run) => run.y + ASCENT_SHARE * run.sizePt)),
    bottom: Math.min(...runs.map((run) => run.y - DESCENT_SHARE * run.sizePt)),
  };
}

/** The box around a page's body text, or null on a page with none. */
export function bodyExtents(layout: PageLayout): Extents | null {
  return runsExtents(bodyRuns(layout));
}

/** The page's body runs split into reading-order columns: one group, or left then right. */
export function columnRunsOf(layout: PageLayout): LayoutTextRun[][] {
  const runs = bodyRuns(layout);
  const extents = runsExtents(runs);
  if (extents === null) return [runs];
  return columnsOf(runs, { left: extents.left, right: extents.right, textRight: extents.right });
}

function sameSheet(a: PageLayout, b: PageLayout): boolean {
  const first = pageSizeOf(a);
  const second = pageSizeOf(b);
  return (
    Math.abs(first.width - second.width) <= 1 &&
    Math.abs(first.height - second.height) <= 1 &&
    columnRunsOf(a).length === columnRunsOf(b).length &&
    (pleadingOf(a) === null) === (pleadingOf(b) === null)
  );
}

/**
 * Consecutive pages on the same paper, set in the same number of columns, and
 * alike in carrying a numbered column or not, share one section — a pleading's
 * header of numbers must never run onto the exhibit stapled behind it.
 */
export function groupSections(layouts: readonly PageLayout[]): PageLayout[][] {
  const groups: PageLayout[][] = [];
  for (const layout of layouts) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (group !== undefined && previous !== undefined && sameSheet(previous, layout)) {
      group.push(layout);
    } else groups.push([layout]);
  }
  return groups;
}

function clampMargin(value: number): number {
  return Number.isFinite(value) ? Math.max(MIN_MARGIN, value) : DEFAULT_MARGIN;
}

/**
 * Left and right margins, read off the body text. The right margin is never
 * wider than the left — a page of short lines says nothing about where the
 * right margin was, and a symmetric guess keeps centred headings centred — and
 * carries a little slack so a line that filled the PDF's width never wraps.
 * Top and bottom are provisional here; withVerticalMargins settles them once
 * the paragraphs' line boxes are known.
 */
function marginsFor(pages: readonly PageLayout[], size: PageSize): Margins {
  const extents = pages.map(bodyExtents).filter((box): box is Extents => box !== null);
  if (extents.length === 0) {
    return {
      top: DEFAULT_MARGIN,
      right: DEFAULT_MARGIN,
      bottom: DEFAULT_MARGIN,
      left: DEFAULT_MARGIN,
    };
  }
  const left = clampMargin(Math.min(...extents.map((box) => box.left)));
  const computedRight = size.width - textRightOf(pages);
  return {
    left,
    right: Math.max(MIN_RIGHT_MARGIN, Math.min(computedRight, left) - RIGHT_SLACK),
    top: DEFAULT_MARGIN,
    bottom: DEFAULT_MARGIN,
  };
}

/** The furthest right any body text reaches on the section's pages — the margin must let it through. */
function textRightOf(pages: readonly PageLayout[]): number {
  const rights = pages.map(bodyExtents).flatMap((box) => (box === null ? [] : [box.right]));
  return rights.length === 0 ? 0 : Math.max(...rights);
}

/** Share of the widest runs set aside as outliers — a caption cell past the margin. */
const OUTLIER_SHARE = 0.03;

/**
 * Where the body text block ends, for judging alignment and short lines —
 * read off the runs with the few widest set aside, so one caption cell that
 * sits past the margin does not make every full line look short.
 */
function typicalTextRight(pages: readonly PageLayout[]): number {
  const rights = pages
    .flatMap(bodyRuns)
    .filter((run) => run.text.trim().length >= 3)
    .map((run) => run.x + run.width)
    .sort((a, b) => b - a);
  if (rights.length === 0) return 0;
  return rights[Math.min(rights.length - 1, Math.floor(OUTLIER_SHARE * rights.length))] ?? 0;
}

/**
 * The section's top and bottom margins from where its pages' content boxes
 * begin and end. The top is exact (it places the first line); the bottom is
 * only ever a floor, so it is capped — more room below never moves anything,
 * while too little pushes the last line onto a page of its own.
 */
export function withVerticalMargins(
  geometry: SectionGeometry,
  boxes: readonly { top: number; bottom: number }[]
): SectionGeometry {
  if (geometry.pleading?.grid === true) return withPleadingMargins(geometry, geometry.pleading);
  if (boxes.length === 0) return geometry;
  const top = geometry.size.height - Math.max(...boxes.map((box) => box.top));
  const bottom = Math.min(...boxes.map((box) => box.bottom)) - RIGHT_SLACK;
  return {
    ...geometry,
    margins: {
      ...geometry.margins,
      top: Math.max(MIN_VERTICAL, top),
      bottom: Math.min(MAX_BOTTOM, Math.max(MIN_VERTICAL, bottom)),
    },
  };
}

/**
 * On pleading paper the body's top is line 1's box top, exactly, and the
 * bottom leaves room for every numbered line: the numbers in the header are
 * placed from the same figure, which is what keeps line k beside number k.
 */
function withPleadingMargins(geometry: SectionGeometry, pleading: Pleading): SectionGeometry {
  const lineOneTop = pleading.firstBaseline + BASELINE_SHARE * pleading.pitchPt;
  const top = geometry.size.height - lineOneTop;
  const bottom = lineOneTop - (pleading.count + 0.5) * pleading.pitchPt;
  return {
    ...geometry,
    margins: { ...geometry.margins, top: Math.max(0, top), bottom: Math.max(0, bottom) },
  };
}

/** Distance from the top edge to the header text; the default when there is none. */
function headerDistance(pages: readonly PageLayout[], size: PageSize, margins: Margins): number {
  const tops = pages.flatMap((layout) =>
    layout.runs
      .filter((run) => run.role === 'header')
      .map((run) => run.y + ASCENT_SHARE * run.sizePt)
  );
  if (tops.length === 0) return DEFAULT_BAND;
  return Math.min(margins.top, Math.max(MIN_MARGIN / 2, size.height - Math.max(...tops)));
}

function footerDistance(pages: readonly PageLayout[], margins: Margins): number {
  const bottoms = pages.flatMap((layout) =>
    layout.runs
      .filter((run) => run.role === 'footer' || run.role === 'page-number')
      .map((run) => run.y - DESCENT_SHARE * run.sizePt)
  );
  if (bottoms.length === 0) return DEFAULT_BAND;
  return Math.min(margins.bottom, Math.max(MIN_MARGIN / 2, Math.min(...bottoms)));
}

const ONE_COLUMN: Omit<ColumnLayout, 'secondLeft'> = { count: 1, widths: [], spacePt: 0 };

/** Word columns from the first page set in two, or a single column. */
function columnLayoutOf(pages: readonly PageLayout[], frame: BodyFrame): ColumnLayout {
  const split = pages.map(columnRunsOf).find((columns) => columns.length === 2);
  const [left, right] = split ?? [];
  if (left === undefined || right === undefined) return { ...ONE_COLUMN, secondLeft: frame.left };
  const leftRight = Math.max(...left.map((run) => run.x + run.width)) + RIGHT_SLACK;
  const secondLeft = Math.min(...right.map((run) => run.x));
  return {
    count: 2,
    widths: [leftRight - frame.left, frame.right - secondLeft],
    spacePt: Math.max(1, secondLeft - leftRight),
    secondLeft,
  };
}

/** Everything the section's pages agree on: paper, margins, the body frame. */
export function sectionGeometry(pages: PageLayout[]): SectionGeometry {
  const first = pages[0];
  if (first === undefined) throw new Error('A section needs at least one page.');
  const size = pageSizeOf(first);
  const margins = marginsFor(pages, size);
  const frame: BodyFrame = {
    left: margins.left,
    right: size.width - margins.right,
    textRight: Math.max(margins.left + 1, typicalTextRight(pages)),
  };
  return {
    size,
    orientation: size.width > size.height ? 'landscape' : 'portrait',
    margins,
    headerPt: headerDistance(pages, size, margins),
    footerPt: footerDistance(pages, margins),
    frame,
    columns: columnLayoutOf(pages, frame),
    pages,
    pleading: pleadingOfSection(pages),
  };
}

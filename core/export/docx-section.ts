/**
 * A Word section per run of same-size pages: paper size, margins, header and
 * footer — and on pleading paper the header table of line numbers and rules
 * (docx-pleading.ts) with the fixed top margin that puts line 1 beside number
 * 1. The header and footer are real Word headers and footers built from the
 * first page's running head and foot, with the printed page number replaced
 * by a PAGE field so the numbers keep counting after the attorney edits.
 */

import {
  BorderStyle,
  Column,
  Footer,
  Header,
  LineNumberRestartFormat,
  PageOrientation,
} from 'docx';
import type { ISectionOptions, Paragraph as DocxParagraph } from 'docx';
import type { LayoutFont, LayoutTextRun, PageLayout } from '@shared/types';
import { docxTextParagraph } from './docx-paragraph';
import { pleadingFrame, pleadingHeader, pleadingMargins } from './docx-pleading';
import { countsPages, firstPageDiffers, footRuns, pageNumberStart } from './first-page-foot';
import { RULE_PT, emptyLine, ruleSpace } from './footer-rule';
import { linesOf } from './lines';
import { BASELINE_SHARE, twips } from './model';
import type { BodyFrame, TextParagraph } from './model';
import type { SectionGeometry } from './page-setup';
import { paragraphsOf } from './paragraphs';

type SectionProperties = NonNullable<ISectionOptions['properties']>;
type Fonts = Readonly<Record<string, LayoutFont>>;

/** Word will not number lines closer to the text than this. */
const MIN_NUMBER_DISTANCE = 4;
/** A header or footer may not start closer to the paper's edge than this. */
const MIN_BAND_PT = 12;
/** Room between a band's inner edge and the body, so Word never has to move the body. */
const BAND_CLEARANCE = 1;

/** Numbers that followed the text lines are Word's own numbering, restarted per page. */
function lineNumbersFor(geometry: SectionGeometry): Pick<SectionProperties, 'lineNumbers'> {
  const { pleading } = geometry;
  if (pleading === null || pleading.grid) return {};
  return {
    lineNumbers: {
      countBy: 1,
      restart: LineNumberRestartFormat.NEW_PAGE,
      distance: twips(Math.max(MIN_NUMBER_DISTANCE, geometry.frame.left - pleading.numberRight)),
    },
  };
}

/**
 * Where the running head's top and the foot's bottom sit, from the paper's
 * edges, and how far each band reaches into the page, points. Word never lets
 * a band overlap the body: a footer taller than the bottom margin pushes the
 * body up, and the page spills — so the margins are widened to the bands.
 */
export interface BandDistances {
  headerPt?: number;
  /** The head's bottom edge from the paper's top, points. */
  headerReachPt?: number;
  footerPt?: number;
  /** The foot's top edge from the paper's bottom, points. */
  footerReachPt?: number;
  pageNumberStart?: number;
}

export function sectionProperties(
  geometry: SectionGeometry,
  bands: BandDistances = {}
): SectionProperties {
  const { size, margins, pleading } = geometry;
  const margin = {
    top: twips(Math.max(margins.top, (bands.headerReachPt ?? 0) + BAND_CLEARANCE)),
    right: twips(margins.right),
    bottom: twips(Math.max(margins.bottom, (bands.footerReachPt ?? 0) + BAND_CLEARANCE)),
    left: twips(margins.left),
    header: twips(bands.headerPt ?? geometry.headerPt),
    footer: twips(bands.footerPt ?? geometry.footerPt),
  };
  // The docx package swaps width and height itself for a landscape section,
  // so it is handed the portrait measurements and the orientation.
  return {
    page: {
      size: {
        width: twips(Math.min(size.width, size.height)),
        height: twips(Math.max(size.width, size.height)),
        orientation:
          geometry.orientation === 'landscape'
            ? PageOrientation.LANDSCAPE
            : PageOrientation.PORTRAIT,
      },
      margin:
        pleading?.grid === true
          ? pleadingMargins(pleadingFrame(pleading, geometry), margin)
          : margin,
      ...(bands.pageNumberStart === undefined
        ? {}
        : { pageNumbers: { start: bands.pageNumberStart } }),
    },
    ...columnsFor(geometry),
    ...lineNumbersFor(geometry),
  };
}

/** Two unequal Word columns, laid exactly where the page's columns were. */
function columnsFor(geometry: SectionGeometry): Pick<SectionProperties, 'column'> {
  const { columns } = geometry;
  const [first = 0, second = 0] = columns.widths;
  if (columns.count !== 2) return {};
  return {
    column: {
      count: 2,
      space: twips(columns.spacePt),
      equalWidth: false,
      children: [
        new Column({ width: twips(first), space: twips(columns.spacePt) }),
        new Column({ width: twips(second) }),
      ],
    },
  };
}

/** A running head or foot laid out exactly: where its box starts and ends, and its paragraphs. */
interface Band {
  paragraphs: TextParagraph[];
  /** PDF y of the band's top and bottom edges. */
  top: number;
  bottom: number;
}

function firstBaselineOf(paragraph: TextParagraph): number {
  return paragraph.lines[0]?.baseline ?? 0;
}

function lastBaselineOf(paragraph: TextParagraph): number {
  return paragraph.lines.at(-1)?.baseline ?? firstBaselineOf(paragraph);
}

/** A lone line takes the gap to the line above it, never more than its default. */
function tightenLonePitches(paragraphs: readonly TextParagraph[]): void {
  let previousBaseline: number | null = null;
  for (const paragraph of paragraphs) {
    const gap = previousBaseline === null ? 0 : previousBaseline - firstBaselineOf(paragraph);
    if (paragraph.lines.length === 1 && gap > 0 && gap < paragraph.leadingPt) {
      paragraph.leadingPt = Math.max(gap, 1);
    }
    previousBaseline = lastBaselineOf(paragraph);
  }
}

/** Space-before from the band's own top edge; returns the band's box edges. */
function settleBand(paragraphs: readonly TextParagraph[]): Pick<Band, 'top' | 'bottom'> {
  const first = paragraphs[0];
  if (first === undefined) return { top: 0, bottom: 0 };
  const top = firstBaselineOf(first) + BASELINE_SHARE * first.leadingPt;
  let previousBottom = top;
  for (const paragraph of paragraphs) {
    const boxTop = firstBaselineOf(paragraph) + BASELINE_SHARE * paragraph.leadingPt;
    paragraph.spaceBeforePt = Math.max(0, previousBottom - boxTop);
    previousBottom = lastBaselineOf(paragraph) - (1 - BASELINE_SHARE) * paragraph.leadingPt;
  }
  return { top, bottom: previousBottom };
}

/**
 * The band's lines as paragraphs on their own pitch, with space-before
 * measured from the band's own top edge. A firm's letter-spaced slug of three
 * eight-point lines then makes a 24-point footer, not a page-and-a-half one.
 */
function bandOf(runs: readonly LayoutTextRun[], frame: BodyFrame): Band {
  const paragraphs = paragraphsOf(linesOf(runs, []), { frame });
  tightenLonePitches(paragraphs);
  return { paragraphs, ...settleBand(paragraphs) };
}

function bandParagraphs(band: Band, fonts: Fonts): DocxParagraph[] {
  return band.paragraphs.map((paragraph) =>
    docxTextParagraph(paragraph, fonts, { pageBreakBefore: false })
  );
}

/**
 * The running head laid out from the header's top edge with exact spacing, so
 * it sits in the pleading header's body cell exactly where it sat on the page.
 */
function placedParagraphs(
  runs: readonly LayoutTextRun[],
  fonts: Fonts,
  frame: BodyFrame,
  topOfBand: number
): DocxParagraph[] {
  const paragraphs = paragraphsOf(linesOf(runs, []), { frame });
  let previousBottom = topOfBand;
  return paragraphs.map((paragraph: TextParagraph) => {
    const first = paragraph.lines[0]?.baseline ?? 0;
    const last = paragraph.lines.at(-1)?.baseline ?? 0;
    const top = first + BASELINE_SHARE * paragraph.leadingPt;
    const placed = { ...paragraph, spaceBeforePt: Math.max(0, previousBottom - top) };
    previousBottom = last - (1 - BASELINE_SHARE) * paragraph.leadingPt;
    return docxTextParagraph(placed, fonts, { pageBreakBefore: false });
  });
}

/**
 * A recognised run with no three letters or digits in a row is scanner noise
 * ("H", "KL", ")", a smudge read as punctuation), not a running head or foot.
 * Left in, every fragment becomes a paragraph of the header or footer, the
 * band grows past the margin, and Word squeezes the body onto page after page.
 */
function isNoise(run: LayoutTextRun): boolean {
  return run.hidden === true && !/[A-Za-z0-9]{3}/.test(run.text);
}

/** Recognised text counts as a running head or foot only this close (× page height) to the paper's edge. */
const RECOGNIZED_BAND_SHARE = 0.09;

/**
 * A recognised run far from the paper's edge is body text the classifier
 * misfiled, not a foot: carried into the footer it would reach up into the
 * body, and Word would push the body onto more pages to make room.
 */
function nearEdge(run: LayoutTextRun, page: PageLayout): boolean {
  if (run.hidden !== true) return true;
  const band = RECOGNIZED_BAND_SHARE * page.size.height;
  return run.y <= band || run.y >= page.size.height - band;
}

/** The band's runs on the first page of the section that carries the band at all. */
function bandRuns(pages: readonly PageLayout[], wanted: readonly string[]): LayoutTextRun[] {
  for (const page of pages) {
    const runs = page.runs.filter(
      (run) =>
        wanted.includes(run.role) &&
        run.text.trim().length > 0 &&
        !isNoise(run) &&
        nearEdge(run, page)
    );
    if (runs.length > 0) return runs;
  }
  return [];
}

/**
 * The section's running head as a Word header, or null when no page has one.
 * Read off the first page that carries it: a filing's caption pages often
 * have no running head, and the header must not be lost to them.
 */
export function headerFor(
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry
): { header: Header | null; headerPt?: number; headerReachPt?: number } {
  const runs = bandRuns(pages, ['header']);
  const { pleading } = geometry;
  if (pleading?.grid === true) {
    const frame = pleadingFrame(pleading, geometry);
    const cell: BodyFrame = {
      left: frame.boundary,
      right: frame.tableRight,
      textRight: frame.tableRight,
    };
    const head = placedParagraphs(runs, fonts, cell, geometry.size.height - frame.headerPt);
    return { header: pleadingHeader(pleading, frame, geometry, fonts, head) };
  }
  if (runs.length === 0) return { header: null };
  const band = bandOf(runs, geometry.frame);
  // Word measures the header from the paper's top edge to the header's top.
  const headerPt = Math.max(MIN_BAND_PT, geometry.size.height - band.top);
  return {
    header: new Header({ children: bandParagraphs(band, fonts) }),
    headerPt,
    headerReachPt: geometry.size.height - band.bottom,
  };
}

/** A horizontal rule drawn just above the footer's text — the line under the body on pleading paper. */
function footerRuleAbove(
  pages: readonly PageLayout[],
  runs: readonly LayoutTextRun[]
): number | null {
  const page = pages.find((candidate) => candidate.runs.some((run) => runs.includes(run)));
  if (page === undefined || runs.length === 0) return null;
  const textTop = Math.max(...runs.map((run) => run.y + run.sizePt));
  const rules = page.rules
    .filter((rule) => rule.rect.height <= 3 && rule.rect.width >= 0.3 * page.size.width)
    .map((rule) => rule.rect.y)
    .filter((y) => y >= textTop - 2 && y <= textTop + 30);
  return rules.length === 0 ? null : Math.min(...rules);
}

export interface SectionFoot {
  footer: Footer | null;
  footerPt?: number;
  footerReachPt?: number;
  /** Set when the first page's foot differs (first-page-foot.ts); null when it has none. */
  firstFooter?: Footer | null;
  /** The printed page numbers could not be carried as a field and were left out. */
  numberDropped?: boolean;
  /** The number the section's first page takes, so the PAGE field prints what the pages did. */
  pageNumberStart?: number;
}

/**
 * The first page's foot as a Word footer. The printed page number becomes a
 * PAGE field. Bates stamps are NOT carried: they differ on every page, and a
 * footer that said the first page's number on every page would be a lie.
 */
export function footerFor(
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry
): SectionFoot {
  const start = countsPages(pages) ? pageNumberStart(pages) : undefined;
  const numbering = start === undefined ? {} : { pageNumberStart: start };
  if (!firstPageDiffers(pages)) return { ...footOf(pages, fonts, geometry), ...numbering };
  // The numbered pages speak for the section; the first page keeps its own foot.
  const main = footOf(pages.slice(1), fonts, geometry);
  const first = footOf(pages.slice(0, 1), fonts, geometry, main.footerPt);
  return { ...main, ...numbering, firstFooter: first.footer };
}

/**
 * `sharedPt` is the section's footer distance when this foot is not the one
 * that sets it (a first-page footer): Word keeps one distance per section, so
 * a foot that ended higher than that is padded down to it with an empty line.
 */
function footOf(
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry,
  sharedPt?: number
): SectionFoot {
  const band = bandRuns(pages, ['footer', 'page-number']);
  const { runs, numberDropped } = footRuns(pages, band);
  if (runs.length === 0) return { footer: null, numberDropped };
  const placed = bandOf(runs, geometry.frame);
  const children = bandParagraphs(placed, fonts);
  const padPt = sharedPt === undefined ? 0 : placed.bottom - sharedPt;
  if (padPt > 0.05) children.push(emptyLine(padPt));
  const ruleY = footerRuleAbove(pages, band);
  const first = placed.paragraphs[0];
  // Word measures the footer from the paper's bottom edge to the footer's bottom.
  const footerPt = Math.max(MIN_BAND_PT, placed.bottom);
  if (ruleY === null || first === undefined) {
    return { footer: new Footer({ children }), footerPt, footerReachPt: placed.top, numberDropped };
  }
  const space = ruleSpace(ruleY - placed.top, placed.top, pages);
  children[0] = withTopRule(first, fonts, space);
  const footerReachPt = placed.top + space + RULE_PT;
  return { footer: new Footer({ children }), footerPt, footerReachPt, numberDropped };
}

/** The footer's first paragraph again, with a rule above it `spacePt` from its box. */
function withTopRule(paragraph: TextParagraph, fonts: Fonts, spacePt: number): DocxParagraph {
  return docxTextParagraph(paragraph, fonts, {
    pageBreakBefore: false,
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: Math.round(spacePt) },
    },
  });
}

export const PAGE_NUMBERS_NOTE =
  'Page numbers were left out: the filing does not number its pages straight through (front matter, a restart), and one footer cannot count that way. Add them in Word with Insert > Page Number.';

export const STAMP_NOTE =
  'Bates numbers and stamps were left out: they change on every page, and Word cannot reproduce them as text.';

export function hasStamps(pages: readonly PageLayout[]): boolean {
  return pages.some((page) => page.runs.some((run) => run.role === 'stamp'));
}

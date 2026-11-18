/**
 * A Word section per run of same-size pages: paper size, margins, header and
 * footer — and on pleading paper the header table of line numbers and rules
 * (docx-pleading.ts) with the fixed top margin that puts line 1 beside number
 * 1. The header and footer are real Word headers and footers built from the
 * first page's running head and foot, with the printed page number replaced
 * by a PAGE field so the numbers keep counting after the attorney edits.
 */

import { Column, Header, LineNumberRestartFormat, PageOrientation } from 'docx';
import type { ISectionOptions, Paragraph as DocxParagraph } from 'docx';
import type { LayoutFont, LayoutTextRun, PageLayout } from '@shared/types';
import { docxTextParagraph } from './docx-paragraph';
import { pleadingFrame, pleadingHeader, pleadingMargins } from './docx-pleading';
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
export const MIN_BAND_PT = 12;

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

/**
 * Word never lets a header or footer overlap the body: a foot that reaches a
 * point above the bottom margin takes that point — and with it the page's last
 * lines — out of the body, and a head that reaches below the top margin pushes
 * the whole page down. A NEGATIVE margin is Word's "exactly here, whatever the
 * band holds" (the device the pleading's fixed top margin uses), so a section
 * with a band states that margin negative and the band may sit as close to the
 * text as it did on the page.
 */
function fixedMargin(marginPt: number, bandReachPt: number | undefined): number {
  if (bandReachPt === undefined) return twips(marginPt);
  return -Math.max(1, twips(marginPt));
}

/** An empty band is a point tall (build-docx.ts): it must end this far short of the margin. */
const EMPTY_BAND_ROOM = 2;

/**
 * A band's distance from the paper's edge. A section with no head or foot
 * still carries an empty one, and its margin stays positive — so the empty
 * band is kept clear of the body, or it would push the body all the same.
 */
function bandDistance(
  placedPt: number | undefined,
  reachPt: number | undefined,
  fallbackPt: number,
  marginPt: number
): number {
  const distance = placedPt ?? fallbackPt;
  if (reachPt !== undefined) return distance;
  return Math.max(0, Math.min(distance, marginPt - EMPTY_BAND_ROOM));
}

export function sectionProperties(
  geometry: SectionGeometry,
  bands: BandDistances = {}
): SectionProperties {
  const { size, margins, pleading } = geometry;
  const margin = {
    top: fixedMargin(margins.top, bands.headerReachPt),
    right: twips(margins.right),
    bottom: fixedMargin(margins.bottom, bands.footerReachPt),
    left: twips(margins.left),
    header: twips(
      bandDistance(bands.headerPt, bands.headerReachPt, geometry.headerPt, margins.top)
    ),
    footer: twips(
      bandDistance(bands.footerPt, bands.footerReachPt, geometry.footerPt, margins.bottom)
    ),
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
export interface Band {
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
export function bandOf(runs: readonly LayoutTextRun[], frame: BodyFrame): Band {
  const paragraphs = paragraphsOf(linesOf(runs, []), { frame });
  tightenLonePitches(paragraphs);
  return { paragraphs, ...settleBand(paragraphs) };
}

export function bandParagraphs(band: Band, fonts: Fonts): DocxParagraph[] {
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
export function bandRuns(pages: readonly PageLayout[], wanted: readonly string[]): LayoutTextRun[] {
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

export const STAMP_NOTE =
  'Bates numbers and stamps were left out: they change on every page, and Word cannot reproduce them as text.';

export function hasStamps(pages: readonly PageLayout[]): boolean {
  return pages.some((page) => page.runs.some((run) => run.role === 'stamp'));
}

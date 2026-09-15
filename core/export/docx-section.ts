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
import { PAGE_FIELD, docxTextParagraph } from './docx-paragraph';
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

export function sectionProperties(geometry: SectionGeometry): SectionProperties {
  const { size, margins, pleading } = geometry;
  const margin = {
    top: twips(margins.top),
    right: twips(margins.right),
    bottom: twips(margins.bottom),
    left: twips(margins.left),
    header: twips(geometry.headerPt),
    footer: twips(geometry.footerPt),
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

/** The band's runs as Word paragraphs, each line its own, aligned as it sat. */
function bandParagraphs(
  runs: readonly LayoutTextRun[],
  fonts: Fonts,
  geometry: SectionGeometry
): DocxParagraph[] {
  const lines = linesOf(runs, []);
  return paragraphsOf(lines, { frame: geometry.frame }).map((paragraph) =>
    docxTextParagraph({ ...paragraph, spaceBeforePt: 0 }, fonts, { pageBreakBefore: false })
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

/** The band's runs on the first page of the section that carries the band at all. */
function bandRuns(pages: readonly PageLayout[], wanted: readonly string[]): LayoutTextRun[] {
  for (const page of pages) {
    const runs = page.runs.filter((run) => wanted.includes(run.role) && run.text.trim().length > 0);
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
): Header | null {
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
    return pleadingHeader(pleading, frame, geometry, fonts, head);
  }
  if (runs.length === 0) return null;
  return new Header({ children: bandParagraphs(runs, fonts, geometry) });
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

/**
 * The first page's foot as a Word footer. The printed page number becomes a
 * PAGE field. Bates stamps are NOT carried: they differ on every page, and a
 * footer that said the first page's number on every page would be a lie.
 */
export function footerFor(
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry
): Footer | null {
  const band = bandRuns(pages, ['footer', 'page-number']);
  // Several printed numbers on one sheet (a condensed transcript) are not the
  // sheet's number: no field can stand in for them. Nor can one stand in for a
  // number that does not count up page by page — a phone number in the foot.
  const numbers = band.filter((run) => run.role === 'page-number').length;
  const counting = numbers === 1 && countsPages(pages);
  const runs = band
    .filter((run) => run.role !== 'page-number' || numbers === 1)
    .map((run) =>
      run.role === 'page-number' && counting
        ? { ...run, text: run.text.replace(/\d+/, PAGE_FIELD) }
        : run
    );
  if (runs.length === 0) return null;
  const children = bandParagraphs(runs, fonts, geometry);
  const ruleY = footerRuleAbove(pages, band);
  const first = children[0];
  if (ruleY !== null && first !== undefined) {
    const textTop = Math.max(...band.map((run) => run.y + run.sizePt));
    children[0] = withTopRule(runs, fonts, geometry, Math.max(1, ruleY - textTop));
  }
  return new Footer({ children });
}

/** The footer's first paragraph again, with a rule above it `spacePt` from its text. */
function withTopRule(
  runs: readonly LayoutTextRun[],
  fonts: Fonts,
  geometry: SectionGeometry,
  spacePt: number
): DocxParagraph {
  const paragraph = paragraphsOf(linesOf(runs, []), { frame: geometry.frame })[0];
  if (paragraph === undefined) throw new Error('A footer with text has at least one paragraph.');
  return docxTextParagraph({ ...paragraph, spaceBeforePt: 0 }, fonts, {
    pageBreakBefore: false,
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: Math.round(spacePt) },
    },
  });
}

/** The printed numbers rise by one from each page to the next (where both are known). */
function countsPages(pages: readonly PageLayout[]): boolean {
  const known = pages.filter((page) => page.printedPageNumber !== null);
  if (known.length <= 1) return true;
  return known.slice(1).every((page, index) => {
    const previous = known[index];
    return (
      previous !== undefined &&
      (page.printedPageNumber ?? 0) - (previous.printedPageNumber ?? 0) ===
        page.page - previous.page
    );
  });
}

export const STAMP_NOTE =
  'Bates numbers and stamps were left out: they change on every page, and Word cannot reproduce them as text.';

export function hasStamps(pages: readonly PageLayout[]): boolean {
  return pages.some((page) => page.runs.some((run) => run.role === 'stamp'));
}

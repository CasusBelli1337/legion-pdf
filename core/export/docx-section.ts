/**
 * A Word section per run of same-size pages: paper size, margins, header and
 * footer, and — on pleading paper — Word's own line numbering. The header and
 * footer are real Word headers and footers built from the first page's running
 * head and foot, with the printed page number replaced by a PAGE field so the
 * numbers keep counting after the attorney edits.
 */

import { Column, Footer, Header, LineNumberRestartFormat, PageOrientation } from 'docx';
import type { ISectionOptions, Paragraph as DocxParagraph } from 'docx';
import type { LayoutFont, LayoutTextRun, PageLayout } from '@shared/types';
import { PAGE_FIELD, docxTextParagraph } from './docx-paragraph';
import { linesOf } from './lines';
import { twips } from './model';
import type { SectionGeometry } from './page-setup';
import { paragraphsOf } from './paragraphs';
import type { Pleading } from './pleading';

type SectionProperties = NonNullable<ISectionOptions['properties']>;
type Fonts = Readonly<Record<string, LayoutFont>>;

/** Word will not number lines closer to the text than this. */
const MIN_NUMBER_DISTANCE = 4;

export function sectionProperties(
  geometry: SectionGeometry,
  pleading: Pleading | null
): SectionProperties {
  const { size, margins } = geometry;
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
      margin: {
        top: twips(margins.top),
        right: twips(margins.right),
        bottom: twips(margins.bottom),
        left: twips(margins.left),
        header: twips(geometry.headerPt),
        footer: twips(geometry.footerPt),
      },
    },
    ...columnsFor(geometry),
    ...(pleading === null
      ? {}
      : {
          lineNumbers: {
            countBy: 1,
            restart: LineNumberRestartFormat.NEW_PAGE,
            distance: twips(
              Math.max(MIN_NUMBER_DISTANCE, geometry.frame.left - pleading.numberRight)
            ),
          },
        }),
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
  if (runs.length === 0) return null;
  return new Header({ children: bandParagraphs(runs, fonts, geometry) });
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
  // sheet's number: no field can stand in for them.
  const numbers = band.filter((run) => run.role === 'page-number').length;
  const runs = band
    .filter((run) => run.role !== 'page-number' || numbers === 1)
    .map((run) => (run.role === 'page-number' ? { ...run, text: PAGE_FIELD } : run));
  if (runs.length === 0) return null;
  return new Footer({ children: bandParagraphs(runs, fonts, geometry) });
}

export const STAMP_NOTE =
  'Bates numbers and stamps were left out: they change on every page, and Word cannot reproduce them as text.';

export function hasStamps(pages: readonly PageLayout[]): boolean {
  return pages.some((page) => page.runs.some((run) => run.role === 'stamp'));
}

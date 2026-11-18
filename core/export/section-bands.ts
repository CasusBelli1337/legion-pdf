/**
 * A section's running head and foot as Word wants them stated: the default
 * pair, the first page's own pair where the first page differs, and the
 * section properties that place them.
 */

import { Footer, Header, LineRuleType, Paragraph as DocxParagraph } from 'docx';
import type { ISectionOptions } from 'docx';
import type { LayoutFont, PageLayout } from '@shared/types';
import { PAGE_NUMBERS_NOTE, footerFor, headerFor, sectionProperties } from './docx-section';
import type { SectionGeometry } from './page-setup';

type Fonts = Readonly<Record<string, LayoutFont>>;

/**
 * A section with no running head or foot still states one, a point tall: Word
 * hands a section that states none the PREVIOUS section's — and an exhibit
 * that inherits a pleading's page-tall header of line numbers has room for one
 * line of body per page (a 107-page declaration came out as 3,455).
 */
function emptyBandLine(): DocxParagraph {
  return new DocxParagraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
  });
}

function emptyBand(): DocxParagraph[] {
  return [emptyBandLine()];
}

function defined<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export interface SectionBands {
  section: Pick<ISectionOptions, 'properties' | 'headers' | 'footers'>;
  /** Plain English about what the bands could not carry. */
  notes: string[];
}

export function sectionBands(
  pages: PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry
): SectionBands {
  const { header, headerPt, headerReachPt } = headerFor(pages, fonts, geometry);
  const foot = footerFor(pages, fonts, geometry);
  const properties = sectionProperties(
    geometry,
    defined({
      headerPt,
      headerReachPt,
      footerPt: foot.footerPt,
      footerReachPt: foot.footerReachPt,
      pageNumberStart: foot.numberDropped === true ? undefined : foot.pageNumberStart,
    })
  );
  const headers = { default: header ?? new Header({ children: emptyBand() }) };
  const footers = { default: foot.footer ?? new Footer({ children: emptyBand() }) };
  const notes = foot.numberDropped === true ? [PAGE_NUMBERS_NOTE] : [];
  if (foot.firstFooter === undefined) return { section: { properties, headers, footers }, notes };
  // "Different first page" asks for the first page's header as well as its footer.
  const firstHeader = headerFor(pages, fonts, geometry).header;
  const section = {
    properties: { ...properties, titlePage: true },
    headers: { ...headers, first: firstHeader ?? new Header({ children: emptyBand() }) },
    footers: { ...footers, first: foot.firstFooter ?? new Footer({ children: emptyBand() }) },
  };
  return { section, notes };
}

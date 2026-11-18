/**
 * The section's running foot as a Word footer: the foot's own lines laid out
 * from the band's top edge (docx-section.ts), a firm's slug in the margin as
 * frames (margin-slug.ts), the rule above it, the printed page number as a
 * PAGE field — and the opening page's own foot when it prints no number.
 */

import { BorderStyle, Footer } from 'docx';
import type { Paragraph as DocxParagraph } from 'docx';
import type { LayoutFont, LayoutTextRun, PageLayout } from '@shared/types';
import { PAGE_FIELD, docxTextParagraph } from './docx-paragraph';
import { MIN_BAND_PT, bandOf, bandParagraphs, bandRuns } from './docx-section';
import { linesOf } from './lines';
import { slugParagraph, splitMarginRuns } from './margin-slug';
import type { TextParagraph } from './model';
import type { SectionGeometry } from './page-setup';

type Fonts = Readonly<Record<string, LayoutFont>>;

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

interface Foot {
  footer: Footer | null;
  footerPt?: number;
  footerReachPt?: number;
}

/**
 * The foot of the first of `source` that carries one, as a Word footer. The
 * printed page number becomes a PAGE field. Bates stamps are NOT carried: they
 * differ on every page, and a footer that said the first page's number on
 * every page would be a lie.
 */
function footOf(
  source: readonly PageLayout[],
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry
): Foot {
  const band = bandRuns(source, ['footer', 'page-number']);
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
  if (runs.length === 0) return { footer: null };
  const { margin, main } = splitMarginRuns(runs, geometry.frame);
  const placed = bandOf(main, geometry.frame);
  const children = bandParagraphs(placed, fonts);
  const ruleY = footerRuleAbove(pages, band);
  const first = placed.paragraphs[0];
  if (ruleY !== null && first !== undefined) {
    children[0] = withTopRule(first, fonts, Math.max(1, ruleY - placed.top));
  }
  // Word measures the footer from the paper's bottom edge to the footer's bottom.
  const footerPt = Math.max(MIN_BAND_PT, placed.bottom);
  const slugs = slugParagraphs(margin, fonts, geometry);
  return {
    footer: new Footer({ children: [...slugs, ...children] }),
    footerPt,
    footerReachPt: placed.top,
  };
}

/** The foot's words apart from the page number, spacing aside. */
function footText(page: PageLayout): string {
  return bandRuns([page], ['footer'])
    .map((run) => run.text)
    .join('')
    .replace(/\s+/g, '');
}

/** Two pages carry the same running foot — all that differs is whether a number is printed. */
function sameFoot(a: PageLayout, b: PageLayout): boolean {
  const text = footText(a);
  return text.length > 0 && text === footText(b);
}

/**
 * The section's foot. A caption page often prints its foot without a page
 * number: the running foot is then read off the first page that has the
 * number, and the opening page keeps its own as Word's "different first page"
 * — so the number is neither lost to every page behind the caption nor
 * printed on a page that never had one. Only when the two feet are otherwise
 * the same: a later page with a different foot says nothing about this one.
 */
export function footerFor(
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry
): Foot & { firstFooter?: Footer } {
  const numbered = pages.find((page) => page.runs.some((run) => run.role === 'page-number'));
  const opening = pages[0];
  if (
    numbered === undefined ||
    opening === undefined ||
    numbered === opening ||
    !sameFoot(opening, numbered)
  ) {
    return footOf(pages, pages, fonts, geometry);
  }
  const running = footOf([numbered, ...pages], pages, fonts, geometry);
  const own = footOf([opening], pages, fonts, geometry);
  return own.footer === null ? running : { ...running, firstFooter: own.footer };
}

/** The firm's slug in the left margin, each line framed where it sat (margin-slug.ts). */
function slugParagraphs(
  runs: readonly LayoutTextRun[],
  fonts: Fonts,
  geometry: SectionGeometry
): DocxParagraph[] {
  return linesOf(runs, []).map((line) =>
    slugParagraph(line, fonts, geometry.frame, geometry.size.height)
  );
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

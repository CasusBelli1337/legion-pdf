/**
 * The section's running foot as a Word footer: the foot's own lines laid out
 * from the band's top edge (docx-section.ts), a firm's slug in the margin as
 * frames (margin-slug.ts), the rule above it, the printed page number as a
 * PAGE field — and the opening page's own foot when it prints no number.
 */

import { BorderStyle, Footer } from 'docx';
import type { Paragraph as DocxParagraph } from 'docx';
import type { LayoutFont, LayoutTextRun, PageLayout } from '@shared/types';
import { docxTextParagraph } from './docx-paragraph';
import { MIN_BAND_PT, bandOf, bandParagraphs, bandRuns } from './docx-section';
import { countsPages, firstPageDiffers, footRuns, pageNumberStart } from './first-page-foot';
import { RULE_PT, emptyLine, ruleSpace } from './footer-rule';
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

export interface SectionFoot {
  footer: Footer | null;
  footerPt?: number;
  footerReachPt?: number;
  /** Set when the first page's foot differs; null when that page has none. */
  firstFooter?: Footer | null;
  /** The printed page numbers could not be carried as a field and were left out. */
  numberDropped?: boolean;
  /** The number the section's first page takes, so the PAGE field prints what the pages did. */
  pageNumberStart?: number;
}

export const PAGE_NUMBERS_NOTE =
  'Page numbers were left out: the filing does not number its pages straight through (front matter, a restart), and one footer cannot count that way. Add them in Word with Insert > Page Number.';

/**
 * The foot of the first of `source` that carries one, as a Word footer. The
 * printed page number becomes a PAGE field (first-page-foot.ts). Bates stamps
 * are NOT carried: they differ on every page. `sharedPt` is the section's
 * footer distance when this foot is not the one that sets it (a first-page
 * footer): Word keeps one distance per section, so a foot that ended higher
 * is padded down to it with an empty line.
 */
function footOf(
  source: readonly PageLayout[],
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry,
  sharedPt?: number
): SectionFoot {
  const band = bandRuns(source, ['footer', 'page-number']);
  const { runs, numberDropped } = footRuns(pages, band);
  if (runs.length === 0) return { footer: null, numberDropped };
  const { margin, main } = splitMarginRuns(runs, geometry.frame);
  const placed = bandOf(main, geometry.frame);
  const children = bandParagraphs(placed, fonts);
  const padPt = sharedPt === undefined ? 0 : placed.bottom - sharedPt;
  if (padPt > 0.05) children.push(emptyLine(padPt));
  const ruleY = footerRuleAbove(source, band);
  const first = placed.paragraphs[0];
  let footerReachPt = placed.top;
  if (ruleY !== null && first !== undefined) {
    const space = ruleSpace(ruleY - placed.top, placed.top, source);
    children[0] = withTopRule(first, fonts, space);
    footerReachPt = placed.top + space + RULE_PT;
  }
  // Word measures the footer from the paper's bottom edge to the footer's bottom.
  const footerPt = Math.max(MIN_BAND_PT, placed.bottom);
  const slugs = slugParagraphs(margin, fonts, geometry);
  return {
    footer: new Footer({ children: [...slugs, ...children] }),
    footerPt,
    footerReachPt,
    numberDropped,
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

/** The first page that prints a number, when the opening page carries the same foot without one. */
function numberedTwin(pages: readonly PageLayout[]): PageLayout | undefined {
  const numbered = pages.find((page) => page.runs.some((run) => run.role === 'page-number'));
  const opening = pages[0];
  if (numbered === undefined || opening === undefined || numbered === opening) return undefined;
  return sameFoot(opening, numbered) ? numbered : undefined;
}

/**
 * The section's foot. A caption page often prints its foot without a page
 * number: the running foot is then read off the numbered pages, and the
 * opening page keeps its own as Word's "different first page" — so the number
 * is neither lost to every page behind the caption nor printed on a page that
 * never had one. That holds when every later page prints its own place
 * (firstPageDiffers), or when the first numbered page's foot is otherwise the
 * opening page's: a later page with a different foot says nothing about this one.
 */
export function footerFor(
  pages: readonly PageLayout[],
  fonts: Fonts,
  geometry: SectionGeometry
): SectionFoot {
  const start = countsPages(pages) ? pageNumberStart(pages) : undefined;
  const numbering = start === undefined ? {} : { pageNumberStart: start };
  const twin = numberedTwin(pages);
  const differs = firstPageDiffers(pages);
  if (!differs && twin === undefined)
    return { ...footOf(pages, pages, fonts, geometry), ...numbering };
  const rest = pages.slice(1);
  const running = differs
    ? footOf(rest, rest, fonts, geometry)
    : footOf([twin as PageLayout, ...pages], pages, fonts, geometry);
  const own = footOf(pages.slice(0, 1), pages.slice(0, 1), fonts, geometry, running.footerPt);
  if (!differs && own.footer === null) return { ...running, ...numbering };
  return { ...running, ...numbering, firstFooter: own.footer };
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

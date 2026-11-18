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
import {
  countsPages,
  firstPageDiffers,
  footRuns,
  numberedTwin,
  pageNumberStart,
} from './first-page-foot';
import { RULE_PT, emptyLine, footerRuleY, rulePlace } from './footer-rule';
import { linesOf } from './lines';
import { slugParagraph, splitMarginRuns } from './margin-slug';
import type { TextParagraph } from './model';
import { sectionNumberStyle } from './page-numbering';
import { clearestFootFirst, withCommonNumberStyle } from './recognized-foot';
import type { NumberStyle } from './page-numbering';
import type { SectionGeometry } from './page-setup';

type Fonts = Readonly<Record<string, LayoutFont>>;

/**
 * A page number grows — "9" becomes "10", "i" becomes "viii". A left-set line
 * that ends on one was measured to the number it happened to print, and the
 * next wider number wrapped onto a line of its own: the line keeps the whole
 * width instead.
 */
function giveNumberRoom(paragraph: TextParagraph): void {
  const numbered = paragraph.lines.some((line) =>
    line.cells.some((cell) => cell.runs.some((run) => run.text.includes(PAGE_FIELD)))
  );
  if (numbered && paragraph.alignment === 'left') {
    paragraph.indentRightPt = Math.min(paragraph.indentRightPt, 0);
  }
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
  /** How the section counts: roman front matter, arabic argument. */
  numberStyle?: NumberStyle;
}

export const PAGE_NUMBERS_NOTE =
  'Page numbers were left out on some pages: a sheet that prints several numbers, or numbers that do not count up page by page, cannot be carried as a Word page number. Add them in Word with Insert > Page Number.';
export const SLUG_NOTE =
  'The firm name printed small in the margin of a scanned page was left out: it is too small to read reliably.';

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
  const wanted = ['footer', 'page-number'];
  const band = withCommonNumberStyle(
    bandRuns(
      clearestFootFirst(source, (page) => bandRuns([page], wanted)),
      wanted
    ),
    source
  );
  const { runs, numberDropped } = footRuns(pages, band);
  if (runs.length === 0) return { footer: null, numberDropped };
  const { margin, main } = splitMarginRuns(runs, geometry.frame);
  const placed = bandOf(main, geometry.frame);
  placed.paragraphs.forEach(giveNumberRoom);
  const children = bandParagraphs(placed, fonts);
  const padPt = sharedPt === undefined ? 0 : placed.bottom - sharedPt;
  if (padPt > 0.05) children.push(emptyLine(padPt));
  const rule = rulePlace(placed, footerRuleY(source, band), source);
  const ruled = rule === null ? undefined : placed.paragraphs[rule.index];
  let footerReachPt = placed.top;
  if (rule !== null && ruled !== undefined) {
    children[rule.index] = withTopRule(ruled, fonts, rule.spacePt);
    if (rule.index === 0) footerReachPt = placed.top + rule.spacePt + RULE_PT;
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
  const style = sectionNumberStyle(pages);
  const numbering =
    start === undefined
      ? {}
      : { pageNumberStart: start, ...(style === undefined ? {} : { numberStyle: style }) };
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

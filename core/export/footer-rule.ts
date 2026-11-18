/**
 * Two small facts about Word's footers, both measured in real Word: a rule
 * above the footer's text is part of the footer's height, and a section has
 * one footer distance however many footers it carries.
 */

import { LineRuleType, Paragraph as DocxParagraph } from 'docx';
import type { LayoutTextRun, PageLayout } from '@shared/types';
import type { Band } from './docx-section';
import { BASELINE_SHARE, twips } from './model';
import type { TextParagraph } from './model';
import { bodyExtents } from './page-setup';

/** An empty line exactly `heightPt` tall. */
export function emptyLine(heightPt: number): DocxParagraph {
  return new DocxParagraph({
    spacing: { before: 0, after: 0, line: twips(heightPt), lineRule: LineRuleType.EXACT },
  });
}

/** The footer rule's own thickness, points. */
export const RULE_PT = 0.5;
/** Room kept between the footer's rule and the lowest body text, points. */
const RULE_CLEARANCE = 1.5;

/**
 * How far above the footer's text its rule sits. The rule is part of the
 * footer's height, and Word moves the body up to clear it: where the page's
 * last line (a footnote) ends hard against the rule, a rule drawn exactly
 * where the page had it pushes that line onto the next page. The rule gives
 * way by the point or so it takes; the text does not move.
 */
export function ruleSpace(wanted: number, bandTop: number, pages: readonly PageLayout[]): number {
  const lowest = Math.min(
    ...pages.map((page) => bodyExtents(page)?.bottom ?? Number.POSITIVE_INFINITY)
  );
  const room = lowest - RULE_CLEARANCE - RULE_PT - bandTop;
  return Math.max(1, Math.min(wanted, Math.floor(room)));
}

/**
 * The pleading's rule at the foot of the body: a long horizontal line above
 * the foot's lowest line of text and no more than a line or two above its
 * highest. It may run above the whole foot, or between the page number and
 * the title under it.
 */
export function footerRuleY(
  pages: readonly PageLayout[],
  runs: readonly LayoutTextRun[]
): number | null {
  const page = pages.find((candidate) => candidate.runs.some((run) => runs.includes(run)));
  if (page === undefined || runs.length === 0) return null;
  const textTop = Math.max(...runs.map((run) => run.y + run.sizePt));
  const lowest = Math.min(...runs.map((run) => run.y));
  const rules = page.rules
    .filter((rule) => rule.rect.height <= 3 && rule.rect.width >= 0.3 * page.size.width)
    .map((rule) => rule.rect.y)
    .filter((y) => y > lowest && y <= textTop + 30);
  return rules.length === 0 ? null : Math.min(...rules);
}

function boxTopOf(paragraph: TextParagraph): number {
  return (paragraph.lines[0]?.baseline ?? 0) + BASELINE_SHARE * paragraph.leadingPt;
}

/** Word draws a border no further than this from its paragraph, points. */
const MAX_BORDER_SPACE = 31;

/**
 * Which of the foot's paragraphs the rule sits on top of, and how far above
 * it. Under a page number the rule takes its height out of the gap that was
 * there, so the title below it does not move.
 */
export function rulePlace(
  band: Band,
  ruleY: number | null,
  pages: readonly PageLayout[]
): { index: number; spacePt: number } | null {
  if (ruleY === null) return null;
  const index = band.paragraphs.findIndex(
    (paragraph) => (paragraph.lines[0]?.baseline ?? 0) < ruleY
  );
  const paragraph = band.paragraphs[index];
  if (paragraph === undefined) return null;
  if (index === 0) return { index, spacePt: ruleSpace(ruleY - band.top, band.top, pages) };
  const gap = Math.floor(ruleY - boxTopOf(paragraph));
  const spacePt = Math.max(1, Math.min(MAX_BORDER_SPACE, gap));
  paragraph.spaceBeforePt = Math.max(0, paragraph.spaceBeforePt - spacePt - RULE_PT);
  return { index, spacePt };
}

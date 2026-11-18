/**
 * Two small facts about Word's footers, both measured in real Word: a rule
 * above the footer's text is part of the footer's height, and a section has
 * one footer distance however many footers it carries.
 */

import { LineRuleType, Paragraph as DocxParagraph } from 'docx';
import type { PageLayout } from '@shared/types';
import { twips } from './model';
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

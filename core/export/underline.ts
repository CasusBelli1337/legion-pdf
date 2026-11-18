/**
 * Which rules are underlines. A PDF draws an underline as a thin rule just
 * under the baseline; so does a caption box draw its foot, and on a scan the
 * box's foot sits a point under the last line typed in it. A rule that meets
 * an upright one is a border of something, never an underline.
 */

import type { LayoutRule, LayoutTextRun } from '@shared/types';

/** Rules this close, points, meet. */
const MEETS = 2;
/** Thicker than this, points, is not a drawn line. */
const MAX_THICKNESS = 3;
/** An upright rule shorter than this, points, is a tick, not a border. */
const MIN_UPRIGHT = 8;

function isUpright(rule: LayoutRule): boolean {
  return rule.rect.width <= MAX_THICKNESS && rule.rect.height >= MIN_UPRIGHT;
}

function meets(a: LayoutRule, b: LayoutRule): boolean {
  return (
    a.rect.x - MEETS <= b.rect.x + b.rect.width &&
    b.rect.x - MEETS <= a.rect.x + a.rect.width &&
    a.rect.y - MEETS <= b.rect.y + b.rect.height &&
    b.rect.y - MEETS <= a.rect.y + a.rect.height
  );
}

/** The rules that could underline text: the level ones no upright rule meets. */
export function underlineRules(rules: readonly LayoutRule[]): LayoutRule[] {
  const uprights = rules.filter(isUpright);
  return rules.filter(
    (rule) => !isUpright(rule) && !uprights.some((upright) => meets(rule, upright))
  );
}

/** An underline is a thin rule just under the baseline, spanning the run. */
export function isUnderlined(run: LayoutTextRun, rules: readonly LayoutRule[]): boolean {
  const band = Math.max(1, 0.2 * run.sizePt);
  return rules.some(
    (rule) =>
      rule.rect.height <= band &&
      rule.rect.y <= run.y &&
      rule.rect.y >= run.y - band &&
      rule.rect.x <= run.x + 1 &&
      rule.rect.x + rule.rect.width >= run.x + run.width - 1
  );
}

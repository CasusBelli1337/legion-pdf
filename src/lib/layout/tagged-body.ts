/**
 * A tagged paragraph is body text wherever its lines fall. The role
 * classifier works by position, and a footnote sits where running feet sit:
 * its last line — or the whole footnote — was filed as a footer, and the
 * export either dropped it or printed page 1's footnote at the foot of every
 * page (a section's footer is read off one page). The structure tree knows
 * better. Word and Acrobat mark real running heads and feet as artifacts,
 * outside the tree; on a page whose running foot is untagged, a tagged
 * "footer" line is the page's own text. Where nothing on the page shows the
 * producer leaves its feet untagged, a tagged line is still reclaimed when it
 * shares a block with body text or sits on the next line down from it.
 */

import type { LayoutTextRun } from '@shared/types';

const BAND_ROLES: ReadonlySet<string> = new Set(['header', 'footer']);
/** "The next line down": this many type sizes below a body baseline, at most. */
const NEXT_LINE = 1.6;
/** A raised footnote mark is small; its line is judged at no less than this size. */
const MIN_LINE_SIZE = 10;

function continuesBody(run: LayoutTextRun, body: readonly LayoutTextRun[]): boolean {
  const reach = NEXT_LINE * Math.max(run.sizePt, MIN_LINE_SIZE);
  return body.some(
    (other) => other.block?.id === run.block?.id || (other.y > run.y && other.y - run.y <= reach)
  );
}

/** Marks as body every tagged head or foot run that belongs to the page's text. */
export function reclaimTaggedBody(runs: LayoutTextRun[]): void {
  const body = runs.filter((run) => run.role === 'body' && run.block !== undefined);
  const bands = runs.filter((run) => BAND_ROLES.has(run.role) && run.text.trim().length > 0);
  const artifactFeet = bands.some((run) => run.block === undefined);
  const candidates = bands.filter((run) => run.block !== undefined).sort((a, b) => b.y - a.y);
  for (const run of candidates) {
    if (!artifactFeet && !continuesBody(run, body)) continue;
    run.role = 'body';
    body.push(run);
  }
}

/**
 * The two operations behind the Text and Cover tools.
 *
 * Cover-then-retype is deliberately two calls, not one clever one: each proves
 * its own page count on the main side before the next begins, so a failure
 * halfway leaves a document that is exactly one verified step further on.
 */

import type { DocumentSession } from '@shared/types';
import type { TextPreview } from './text-overlay';
import type { Placement } from './use-placement';
import type { StampRunner } from './use-stamp-runner';

/** How far inside the covered box the retyped text starts, in points. */
const RETYPE_INSET = 2;

export interface TextActions {
  addText(): void;
  cover(retype: boolean): void;
}

export function useTextActions(
  session: DocumentSession,
  runner: StampRunner,
  placement: Placement,
  ink: TextPreview,
  onDone: () => void
): TextActions {
  const addText = (): void => {
    const point = placement.point;
    if (point === null) return;
    void runner
      .run('Adding the text', async () => {
        await window.librarius.stamp.textBox(session.id, {
          page: point.page,
          at: point.at,
          ...ink,
        });
        return `Added text to page ${point.page}. Save the document to keep it.`;
      })
      .then(onDone);
  };

  const cover = (retype: boolean): void => {
    const area = placement.rect;
    if (area === null) return;
    void runner
      .run(retype ? 'Covering and retyping' : 'Covering the area', async () => {
        await window.librarius.stamp.whiteout(session.id, { page: area.page, rect: area.rect });
        if (retype) {
          const at = { x: area.rect.x + RETYPE_INSET, y: area.rect.y + RETYPE_INSET };
          await window.librarius.stamp.textBox(session.id, { page: area.page, at, ...ink });
        }
        const what = retype ? 'Covered an area and typed over it' : 'Covered an area';
        return `${what} on page ${area.page}. Save the document to keep it.`;
      })
      .then(onDone);
  };

  return { addText, cover };
}

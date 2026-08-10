/**
 * Draws the search hits over the pages, through the viewer's overlay seam —
 * the same seam the stamp and redaction lanes use, so find is also the worked
 * example of how an overlay is registered.
 */

import { createElement, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { TextMatch } from '@shared/types';
import type { PageOverlayContext, ViewerApi } from '../../components/viewer';

const OVERLAY_ID = 'find-highlights';

function highlightsFor(
  context: PageOverlayContext,
  matches: readonly TextMatch[],
  active: number
): ReactNode {
  const onThisPage = matches.filter((match) => match.page === context.page);
  if (onThisPage.length === 0) return null;

  return onThisPage.flatMap((match) =>
    match.quads.map((quad, quadIndex) => {
      const box = context.toLocalBox(quad);
      const isActive = matches[active] === match;
      return createElement('span', {
        key: `${match.index}-${quadIndex}`,
        className: `absolute rounded-xs ${isActive ? 'bg-purple-500/55' : 'bg-purple-400/30'}`,
        style: {
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
        },
      });
    })
  );
}

export function useFindHighlights(
  api: ViewerApi | null,
  matches: readonly TextMatch[],
  active: number
): void {
  useEffect(() => {
    if (api === null || matches.length === 0) return;
    return api.registerOverlay(OVERLAY_ID, (context) => highlightsFor(context, matches, active));
  }, [active, api, matches]);
}

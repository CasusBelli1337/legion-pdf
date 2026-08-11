/**
 * Mounting a preview over the pages, through the viewer's overlay seam.
 *
 * Registering an overlay does NOT re-render the pages by itself, so a render
 * prop that closes over changing state has to be REGISTERED AGAIN whenever
 * that state changes — pass a `useMemo`/`useCallback` renderer and the effect
 * below does the rest. (src/features/find/find-highlights.ts is the same
 * pattern, and the reason it is a pattern.)
 */

import { useEffect } from 'react';
import type { PageOverlayRenderer, ViewerApi } from '@renderer/components/viewer';

export function useMarkOverlay(
  api: ViewerApi | null,
  id: string,
  render: PageOverlayRenderer | null
): void {
  useEffect(() => {
    if (api === null || render === null) return;
    return api.registerOverlay(id, render);
  }, [api, id, render]);
}

/**
 * Arming and placing: the panel arms a field kind, the next click on a page
 * drops that kind's default box there for the active signer, and the tool
 * disarms — one click, one field. Escape backs out without placing anything.
 *
 * The box is centred on the click but clamped to the page, so a field aimed
 * at a margin edge lands fully on the paper instead of hanging off it.
 */

import { useCallback, useEffect } from 'react';
import type { PageSize, PdfPoint, PdfRect } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
import { rectAt } from './field-geometry';
import { useEsignStore } from './request-store';

/** Keeps a field's box entirely on its page, shrinking it only if it must. */
export function clampToPage(rect: PdfRect, size: PageSize): PdfRect {
  const width = Math.min(rect.width, size.width);
  const height = Math.min(rect.height, size.height);
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 0), size.width - width),
    y: Math.min(Math.max(rect.y, 0), size.height - height),
  };
}

export type PlaceFieldAt = (page: number, at: PdfPoint) => void;

/**
 * The click handler the armed ClickSurface calls. A no-op while nothing is
 * armed or no signer is chosen — the surface is only mounted while armed, so
 * that is belt and braces, not a real path.
 */
export function usePlaceField(
  api: ViewerApi | null,
  docId: string,
  activeSignerId: string | null
): PlaceFieldAt {
  const placing = useEsignStore((state) => state.placing);
  const addField = useEsignStore((state) => state.addField);
  const setPlacing = useEsignStore((state) => state.setPlacing);

  return useCallback(
    (page, at) => {
      if (placing === null || activeSignerId === null) return;
      const size = api?.pageSize(page) ?? null;
      const rect = rectAt(placing, at);
      addField(docId, {
        kind: placing,
        signerId: activeSignerId,
        page,
        rect: size === null ? rect : clampToPage(rect, size),
        label: undefined,
        required: true,
      });
      setPlacing(null);
    },
    [activeSignerId, addField, api, docId, placing, setPlacing]
  );
}

/** Escape disarms — pressing it while a field kind is armed places nothing. */
export function useEscapeDisarms(armed: boolean): void {
  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      useEsignStore.getState().setPlacing(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [armed]);
}

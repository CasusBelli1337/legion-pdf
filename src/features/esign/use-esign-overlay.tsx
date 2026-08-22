/**
 * One overlay for the whole E-Sign lane: the click-catcher while a field kind
 * is armed, plus every placed field. The renderer is rebuilt — and therefore
 * re-registered — on every change, because registering an overlay does not
 * re-render the pages by itself (see use-mark-overlay's gotcha).
 */

import { useMemo } from 'react';
import type { PageOverlayRenderer, ViewerApi } from '@renderer/components/viewer';
import { ClickSurface, useMarkOverlay } from '@renderer/features/stamps';
import { ESIGN_OVERLAY_ID, EsignFieldOverlay } from './field-overlay';
import { useEsignStore, type RequestField, type RequestSigner } from './request-store';
import { useEscapeDisarms, usePlaceField } from './use-field-placement';

export function useEsignOverlay(
  api: ViewerApi | null,
  docId: string,
  signers: readonly RequestSigner[],
  fields: readonly RequestField[],
  selectedId: string | null,
  activeSignerId: string | null
): void {
  const placing = useEsignStore((state) => state.placing);
  const place = usePlaceField(api, docId, activeSignerId);
  useEscapeDisarms(placing !== null);

  const overlay = useMemo<PageOverlayRenderer | null>(() => {
    if (placing === null && fields.length === 0) return null;
    return (context) => (
      <>
        {placing !== null && <ClickSurface api={api} context={context} onPoint={place} />}
        <EsignFieldOverlay
          api={api}
          context={context}
          signers={signers}
          fields={fields}
          selectedId={selectedId}
        />
      </>
    );
  }, [api, fields, place, placing, selectedId, signers]);

  useMarkOverlay(api, ESIGN_OVERLAY_ID, overlay);
}

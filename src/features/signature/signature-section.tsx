/**
 * F-6 signatures — the section inside Stamps & Marks.
 *
 * Drag a signature out of the library onto the page (or click it, then click
 * the page). It lands as a LIVE object: select it, drag it, resize it by the
 * corner, delete it, put another one three pages later. None of it has touched
 * the PDF — the document only gets signed when the attorney saves, and saving
 * asks first, because after that the signature is page content like any other.
 */

import { useCallback, useMemo, useState } from 'react';
import type { PdfPoint, SignatureAsset } from '@shared/types';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import {
  ClickSurface,
  Hint,
  Problem,
  useMarkOverlay,
  type StampSectionProps,
} from '@renderer/features/stamps';
import { PlacementPanel } from './placement-controls';
import { anchorFromCentre, sizeFor } from './placement-geometry';
import { useLivePlacements, usePlacementStore, type LivePlacement } from './placement-store';
import { placementHeight } from './signature-height';
import { pageAtClientPoint, useSignatureDrag, type SignatureDrag } from './signature-drag';
import { SignatureImportDialog } from './signature-import-dialog';
import { DragGhostLayer, SignatureLibraryView } from './signature-library-view';
import { SignatureOverlay, SIGNATURE_OVERLAY_ID } from './signature-overlay';
import { useDeleteSelectedPlacement } from './use-placement-keys';
import { useSignatureLibrary } from './use-signature-library';

/**
 * Placing a signature drops its CENTRE where the attorney pointed — measured at
 * the height the placement will actually take, which is the last one he set.
 */
function centredAnchor(signature: SignatureAsset, at: PdfPoint): PdfPoint {
  return anchorFromCentre(at, sizeFor(signature, placementHeight()));
}

type DropAt = (signature: SignatureAsset, page: number, at: PdfPoint) => void;

/** The click-catcher while a signature is armed, plus every live placement. */
function useSignatureOverlay(
  api: ReturnType<typeof useViewerApi>,
  armed: SignatureAsset | null,
  placements: readonly LivePlacement[],
  selectedId: string | null,
  drop: DropAt
): void {
  const overlay = useMemo<PageOverlayRenderer | null>(() => {
    if (armed === null && placements.length === 0) return null;
    return (context) => (
      <>
        {armed !== null && (
          <ClickSurface api={api} context={context} onPoint={(page, at) => drop(armed, page, at)} />
        )}
        <SignatureOverlay
          api={api}
          context={context}
          placements={placements}
          selectedId={selectedId}
        />
      </>
    );
  }, [api, armed, drop, placements, selectedId]);
  useMarkOverlay(api, SIGNATURE_OVERLAY_ID, overlay);
}

interface LibrarySlotProps {
  library: ReturnType<typeof useSignatureLibrary>;
  drag: SignatureDrag;
  armed: SignatureAsset | null;
  onArm(signature: SignatureAsset | null): void;
}

/** The grid, or the import dialog once a file has been chosen. Never both. */
function LibrarySlot({ library, drag, armed, onArm }: LibrarySlotProps) {
  const [picked, setPicked] = useState<File | null>(null);
  if (picked !== null) {
    return (
      <SignatureImportDialog
        file={picked}
        busy={library.busy}
        onCancel={() => setPicked(null)}
        onImport={(cleaned) => {
          void library.importFile(picked, cleaned).then(() => setPicked(null));
        }}
      />
    );
  }
  return (
    <SignatureLibraryView
      signatures={library.signatures}
      selectedId={armed?.id ?? null}
      busy={library.busy}
      drag={drag}
      onSelect={onArm}
      onRemove={(signature) => {
        // Removing the armed signature disarms it; it never places itself.
        if (armed?.id === signature.id) onArm(null);
        void library.remove(signature.id);
      }}
      onPick={setPicked}
    />
  );
}

export function SignatureSection({ session }: StampSectionProps) {
  const api = useViewerApi();
  const library = useSignatureLibrary();
  const placements = useLivePlacements(session.id);
  const selectedId = usePlacementStore((state) => state.selectedId);
  const place = usePlacementStore((state) => state.place);
  const remove = usePlacementStore((state) => state.remove);
  const [armed, setArmed] = useState<SignatureAsset | null>(null);

  useDeleteSelectedPlacement(selectedId, remove);

  const drop = useCallback<DropAt>(
    (signature, page, at) => {
      place(session.id, signature, page, centredAnchor(signature, at));
      setArmed(null);
    },
    [place, session.id]
  );

  // A drop that missed every page is simply not a placement: the ghost goes
  // away and nothing lands, rather than a signature appearing somewhere the
  // attorney was not pointing.
  const drag = useSignatureDrag((signature, point) => {
    const target = pageAtClientPoint(api, point);
    if (target !== null) drop(signature, target.page, target.at);
  }, setArmed);

  useSignatureOverlay(api, armed, placements, selectedId, drop);

  return (
    <div className="flex flex-col gap-2">
      <LibrarySlot library={library} drag={drag} armed={armed} onArm={setArmed} />
      {library.error !== null && <Problem message={library.error} />}

      {armed !== null && (
        <Hint>
          Now click the page where it should sit — or drag the tile straight onto the page.
        </Hint>
      )}

      <PlacementPanel placements={placements} selectedId={selectedId} />
      <DragGhostLayer drag={drag} />
    </div>
  );
}

/**
 * Live signatures, drawn on the page they were dropped on.
 *
 * They are deliberately NOT drawn as finished page content: a dashed brand
 * outline says, at a glance, that this is still something the attorney owns and
 * can move. The outline and the handles disappear the moment the signature is
 * flattened into the file at save time — at which point the page IS the
 * signature and there is nothing left to select.
 *
 * The overlay layer itself ignores the mouse, so each signature turns pointer
 * events back on for its own box only; the text under it stays selectable.
 */

import { X } from 'lucide-react';
import type { PageOverlayContext, ViewerApi } from '@renderer/components/viewer';
import { fileUrl } from './file-url';
import { MAX_SIGNATURE_HEIGHT, MIN_SIGNATURE_HEIGHT } from './placement-geometry';
import { usePlacementStore, type LivePlacement } from './placement-store';
import { usePlacementDrag, type PlacementDrag } from './use-placement-drag';

export const SIGNATURE_OVERLAY_ID = 'signature-placements';

function sourceOf(placement: LivePlacement): string {
  return placement.signature.dataUrl ?? fileUrl(placement.signature.filePath);
}

interface HandlesProps {
  placement: LivePlacement;
  drag: PlacementDrag;
  onRemove(): void;
}

/** The chrome a selected signature carries: remove it, or resize it. */
function Handles({ placement, drag, onRemove }: HandlesProps) {
  return (
    <>
      <button
        type="button"
        aria-label={`Remove the ${placement.signature.label} signature from page ${placement.page}`}
        title="Remove this signature"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRemove}
        className="absolute -left-2.5 -top-2.5 rounded-full border border-armory-border-strong bg-armory-elevated p-0.5 text-text-secondary hover:text-danger"
      >
        <X size={10} aria-hidden />
      </button>
      <span
        role="slider"
        tabIndex={0}
        aria-label="Resize the signature"
        aria-valuenow={Math.round(placement.heightPt)}
        aria-valuemin={MIN_SIGNATURE_HEIGHT}
        aria-valuemax={MAX_SIGNATURE_HEIGHT}
        className="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize rounded-sm border border-brand-200 bg-brand-500"
        onPointerDown={drag.start(placement, 'resize')}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
      />
    </>
  );
}

interface PlacedSignatureProps extends HandlesProps {
  context: PageOverlayContext;
  selected: boolean;
}

function PlacedSignature({ placement, context, selected, drag, onRemove }: PlacedSignatureProps) {
  const box = context.toLocalBox({ x: placement.at.x, y: placement.at.y, width: 0, height: 0 });
  const width = placement.widthPt * context.scale;
  const height = placement.heightPt * context.scale;
  const outline = selected ? 'outline-brand-300' : 'outline-brand-500/70';

  return (
    <div
      className={`pointer-events-auto absolute cursor-move outline outline-1 outline-dashed ${outline}`}
      style={{
        left: `${box.left}px`,
        top: `${box.top - height}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      onPointerDown={drag.start(placement, 'move')}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      role="presentation"
    >
      <img
        src={sourceOf(placement)}
        alt=""
        draggable={false}
        className="h-full w-full object-contain"
      />
      {selected && <Handles placement={placement} drag={drag} onRemove={onRemove} />}
    </div>
  );
}

export interface SignatureOverlayProps {
  api: ViewerApi | null;
  context: PageOverlayContext;
  placements: readonly LivePlacement[];
  selectedId: string | null;
}

/** Everything one page's overlay draws. Renders nothing on an unsigned page. */
export function SignatureOverlay({ api, context, placements, selectedId }: SignatureOverlayProps) {
  const drag = usePlacementDrag(api, context.scale);
  const remove = usePlacementStore((state) => state.remove);
  const onThisPage = placements.filter((placement) => placement.page === context.page);
  if (onThisPage.length === 0) return null;

  return (
    <>
      {onThisPage.map((placement) => (
        <PlacedSignature
          key={placement.id}
          placement={placement}
          context={context}
          selected={placement.id === selectedId}
          drag={drag}
          onRemove={() => remove(placement.id)}
        />
      ))}
    </>
  );
}

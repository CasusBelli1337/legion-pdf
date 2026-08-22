/**
 * Every placed e-sign field, drawn over its page in its signer's colour: a
 * bordered translucent box carrying the kind and the signer's name. Clicking
 * selects; the selected box can be dragged, resized from its corner handle, or
 * deleted. None of this touches the PDF — fields are request metadata that
 * leave the app through `esign:createRequest` or `esign:exportFillable`.
 *
 * The overlay layer itself ignores the mouse, so each box turns pointer
 * events back on for itself only; the text under it stays selectable.
 */

import { X } from 'lucide-react';
import type { PageOverlayContext, ViewerApi } from '@renderer/components/viewer';
import { FIELD_TITLES, MAX_FIELD_SIZE, MIN_FIELD_SIZE } from './field-geometry';
import { useEsignStore, type RequestField, type RequestSigner } from './request-store';
import { accentForSigner, signerNameOf } from './signer-colors';
import { useFieldDrag, type FieldDrag } from './use-field-drag';

export const ESIGN_OVERLAY_ID = 'esign-fields';

interface HandlesProps {
  field: RequestField;
  drag: FieldDrag;
  onRemove(): void;
}

/** The chrome a selected field carries: remove it, or resize it. */
function Handles({ field, drag, onRemove }: HandlesProps) {
  return (
    <>
      <button
        type="button"
        aria-label={`Remove the ${FIELD_TITLES[field.kind].toLowerCase()} field on page ${field.page}`}
        title="Remove this field"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRemove}
        className="absolute -left-2.5 -top-2.5 rounded-full border border-armory-border-strong bg-armory-elevated p-0.5 text-text-secondary hover:text-danger"
      >
        <X size={10} aria-hidden />
      </button>
      <span
        role="slider"
        tabIndex={0}
        aria-label="Resize the field"
        aria-valuenow={Math.round(field.rect.width)}
        aria-valuemin={MIN_FIELD_SIZE.width}
        aria-valuemax={MAX_FIELD_SIZE.width}
        className="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize rounded-sm border border-brand-200 bg-brand-500"
        onPointerDown={drag.start(field, 'resize')}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
      />
    </>
  );
}

interface PlacedFieldProps extends HandlesProps {
  signers: readonly RequestSigner[];
  context: PageOverlayContext;
  selected: boolean;
}

function PlacedField({ field, signers, context, selected, drag, onRemove }: PlacedFieldProps) {
  const box = context.toLocalBox(field.rect);
  const accent = accentForSigner(signers, field.signerId);
  const edge = selected ? 'border-2' : 'border border-dashed';

  return (
    <div
      className={`pointer-events-auto absolute cursor-move overflow-hidden ${edge} ${accent.box}`}
      style={{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
      onPointerDown={drag.start(field, 'move')}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      role="presentation"
    >
      <span
        className={`pointer-events-none block truncate px-1 text-xs leading-tight ${accent.text}`}
      >
        {FIELD_TITLES[field.kind]} · {signerNameOf(signers, field.signerId)}
      </span>
      {selected && <Handles field={field} drag={drag} onRemove={onRemove} />}
    </div>
  );
}

export interface EsignFieldOverlayProps {
  api: ViewerApi | null;
  context: PageOverlayContext;
  signers: readonly RequestSigner[];
  fields: readonly RequestField[];
  selectedId: string | null;
}

/** Everything one page's overlay draws. Renders nothing on an unmarked page. */
export function EsignFieldOverlay({
  api,
  context,
  signers,
  fields,
  selectedId,
}: EsignFieldOverlayProps) {
  const drag = useFieldDrag(api);
  const removeField = useEsignStore((state) => state.removeField);
  const onThisPage = fields.filter((field) => field.page === context.page);
  if (onThisPage.length === 0) return null;

  return (
    <>
      {onThisPage.map((field) => (
        <PlacedField
          key={field.id}
          field={field}
          signers={signers}
          context={context}
          selected={field.id === selectedId}
          drag={drag}
          onRemove={() => removeField(field.id)}
        />
      ))}
    </>
  );
}

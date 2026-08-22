/**
 * The boxes already placed, as a list the attorney can audit without hunting
 * through the pages: kind, whose it is, which page. Clicking a row selects
 * the box on the page (the overlay highlights it); 'text' fields take the
 * prompt the signer will see.
 */

import { Hint, Section } from '@renderer/features/stamps';
import { INPUT_CLASS, TrashButton } from './esign-views';
import { FIELD_TITLES } from './field-geometry';
import { useEsignStore, type RequestField, type RequestSigner } from './request-store';
import { accentForSigner, signerNameOf } from './signer-colors';

interface FieldRowProps {
  field: RequestField;
  signers: readonly RequestSigner[];
  selected: boolean;
}

function FieldRow({ field, signers, selected }: FieldRowProps) {
  const selectField = useEsignStore((state) => state.selectField);
  const removeField = useEsignStore((state) => state.removeField);
  const updateField = useEsignStore((state) => state.updateField);
  const shell = selected
    ? 'border-armory-focus bg-armory-interactive'
    : 'border-armory-border bg-armory-elevated';

  return (
    <div className={`flex flex-col gap-1.5 rounded-md border px-2 py-1.5 ${shell}`}>
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${accentForSigner(signers, field.signerId).dot}`}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => selectField(field.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-xs text-text-primary">
            {FIELD_TITLES[field.kind]} · {signerNameOf(signers, field.signerId)}
          </span>
          <span className="block text-xs text-text-muted">Page {field.page}</span>
        </button>
        <TrashButton
          label={`Remove the ${FIELD_TITLES[field.kind].toLowerCase()} field on page ${field.page}`}
          onClick={() => removeField(field.id)}
        />
      </div>
      {field.kind === 'text' && (
        <input
          value={field.label ?? ''}
          placeholder="What should this field ask for?"
          aria-label="What should this field ask for?"
          onChange={(event) => updateField(field.id, { label: event.target.value })}
          className={INPUT_CLASS}
        />
      )}
    </div>
  );
}

export interface FieldListSectionProps {
  signers: readonly RequestSigner[];
  fields: readonly RequestField[];
  selectedId: string | null;
}

export function FieldListSection({ signers, fields, selectedId }: FieldListSectionProps) {
  if (fields.length === 0) return null;
  return (
    <Section title="Placed fields">
      {fields.map((field) => (
        <FieldRow
          key={field.id}
          field={field}
          signers={signers}
          selected={field.id === selectedId}
        />
      ))}
      <Hint>Click a row to highlight the box on the page. Drag the box itself to move it.</Hint>
    </Section>
  );
}

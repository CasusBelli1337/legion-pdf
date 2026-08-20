/**
 * The Bates options form. Every control is a plain-English question, and the
 * live readout above it is the exact string the production will carry.
 */

import type { Corner } from '@shared/types';
import { describePageCount } from './page-range';
import { ChoiceField, NumberField, RangeField, TextField, Toggle } from './stamp-views';
import { BATES_CORNERS, BATES_PREFIX_PLACEHOLDER } from './bates-preview';
import type { BatesForm } from './bates-preview';

const CORNER_LABELS: Record<Corner, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};

const CORNERS = BATES_CORNERS.map((value) => ({ value, label: CORNER_LABELS[value] }));

type Change = (patch: Partial<BatesForm>) => void;

function NumberingFields({ form, onChange }: { form: BatesForm; onChange: Change }) {
  return (
    <>
      <TextField
        label="Prefix"
        value={form.prefix}
        placeholder={BATES_PREFIX_PLACEHOLDER}
        mono
        onChange={(prefix) => onChange({ prefix })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Start at"
          value={form.startNumber}
          min={0}
          onChange={(startNumber) => onChange({ startNumber })}
        />
        <NumberField
          label="Zero-pad to"
          value={form.padWidth}
          min={0}
          max={12}
          onChange={(padWidth) => onChange({ padWidth })}
        />
      </div>
    </>
  );
}

function PlacementFields({ form, onChange }: { form: BatesForm; onChange: Change }) {
  return (
    <>
      <ChoiceField
        label="Corner"
        value={form.position}
        options={CORNERS}
        onChange={(position) => onChange({ position })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Text size"
          value={form.fontSize}
          min={4}
          max={72}
          onChange={(fontSize) => onChange({ fontSize })}
        />
        <NumberField
          label="Margin"
          value={form.margin}
          min={0}
          max={200}
          onChange={(margin) => onChange({ margin })}
        />
      </div>
      <Toggle
        label="White box behind the number (for scans)"
        checked={form.whiteBackingBox}
        onChange={(whiteBackingBox) => onChange({ whiteBackingBox })}
      />
    </>
  );
}

interface BatesFormProps {
  form: BatesForm;
  pageCount: number;
  selectedPages: number;
  rangeError: string | null;
  onChange: Change;
}

export function BatesFields({
  form,
  pageCount,
  selectedPages,
  rangeError,
  onChange,
}: BatesFormProps) {
  return (
    <>
      <NumberingFields form={form} onChange={onChange} />
      <RangeField
        pageCount={pageCount}
        value={form.range}
        error={rangeError}
        note={`${describePageCount(selectedPages)} will be numbered.`}
        onChange={(range) => onChange({ range })}
      />
      <PlacementFields form={form} onChange={onChange} />
    </>
  );
}

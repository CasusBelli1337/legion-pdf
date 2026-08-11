/**
 * The panel side of a live signature: the list of what is waiting on this
 * document, and the settings for whichever one is selected.
 *
 * The list is the honest answer to "what have I done to this file that is not
 * in it yet" — it names the page, it counts, and it says out loud that none of
 * it is saved. Nothing here covers the page; the workspace stays visible while
 * the attorney adjusts (UI golden rule 1).
 */

import { X } from 'lucide-react';
import { ActionButton, Caution, ChoiceField, NumberField, Toggle } from '@renderer/features/stamps';
import { MAX_SIGNATURE_HEIGHT, MIN_SIGNATURE_HEIGHT } from './placement-geometry';
import { usePlacementStore, type LivePlacement } from './placement-store';

const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: '08/10/2026' },
  { value: 'MMMM D, YYYY', label: 'August 10, 2026' },
] as const;

export interface PlacementListProps {
  placements: readonly LivePlacement[];
  selectedId: string | null;
  onSelect(id: string): void;
  onRemove(id: string): void;
}

export function PlacementList({ placements, selectedId, onSelect, onRemove }: PlacementListProps) {
  if (placements.length === 0) return null;
  const noun = placements.length === 1 ? 'signature' : 'signatures';

  return (
    <div className="flex flex-col gap-1">
      <p className="readout text-text-muted">
        {placements.length} {noun} placed, not in the file yet
      </p>
      <ul className="flex max-h-28 flex-col gap-1 overflow-y-auto">
        {placements.map((placement) => (
          <li key={placement.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(placement.id)}
              aria-pressed={placement.id === selectedId}
              className={`flex-1 truncate rounded-md px-2 py-1 text-left text-xs transition-colors duration-150 ${
                placement.id === selectedId
                  ? 'bg-armory-interactive text-brand-300'
                  : 'text-text-secondary hover:bg-armory-interactive hover:text-text-primary'
              }`}
            >
              Page {placement.page} — {placement.signature.label}
            </button>
            <button
              type="button"
              aria-label={`Remove the signature on page ${placement.page}`}
              title="Remove this signature"
              onClick={() => onRemove(placement.id)}
              className="rounded p-1 text-text-muted transition-colors duration-150 hover:bg-armory-interactive hover:text-danger"
            >
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface PlacementControlsProps {
  placement: LivePlacement;
  onHeight(heightPt: number): void;
  onDate(patch: { withDate?: boolean; dateFormat?: string }): void;
  onRemove(): void;
}

export function PlacementControls({
  placement,
  onHeight,
  onDate,
  onRemove,
}: PlacementControlsProps) {
  return (
    <>
      <NumberField
        label={`Height on page ${placement.page} (points)`}
        value={Math.round(placement.heightPt)}
        min={MIN_SIGNATURE_HEIGHT}
        max={MAX_SIGNATURE_HEIGHT}
        onChange={onHeight}
      />
      <Toggle
        label="Stamp the date beside it"
        checked={placement.withDate}
        onChange={(withDate) => onDate({ withDate })}
      />
      {placement.withDate && (
        <ChoiceField
          label="Date format"
          value={placement.dateFormat}
          options={DATE_FORMATS}
          onChange={(dateFormat) => onDate({ dateFormat })}
        />
      )}
      <ActionButton label="Remove this signature" variant="quiet" onClick={onRemove} />
    </>
  );
}

/**
 * The whole live-signature side of the panel: what is waiting, the settings for
 * the selected one, and the standing warning that none of it is in the file.
 */
export function PlacementPanel({
  placements,
  selectedId,
}: {
  placements: readonly LivePlacement[];
  selectedId: string | null;
}) {
  const remove = usePlacementStore((state) => state.remove);
  const select = usePlacementStore((state) => state.select);
  const resizeTo = usePlacementStore((state) => state.resizeTo);
  const setDate = usePlacementStore((state) => state.setDate);
  const selected = placements.find((placement) => placement.id === selectedId) ?? null;

  if (placements.length === 0) return null;

  return (
    <>
      <PlacementList
        placements={placements}
        selectedId={selectedId}
        onSelect={select}
        onRemove={remove}
      />
      {selected !== null && (
        <PlacementControls
          placement={selected}
          onHeight={(height) => resizeTo(selected.id, height)}
          onDate={(patch) => setDate(selected.id, patch)}
          onRemove={() => remove(selected.id)}
        />
      )}
      <Caution>
        {placements.length === 1
          ? 'This signature is not in the file yet. Saving places it permanently — you will be asked first. Closing without saving leaves the document unsigned.'
          : 'These signatures are not in the file yet. Saving places them permanently — you will be asked first. Closing without saving leaves the document unsigned.'}
      </Caution>
    </>
  );
}

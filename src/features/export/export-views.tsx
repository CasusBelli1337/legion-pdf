/**
 * The Export panel's pieces. Armory tokens only, no hardcoded colours, no
 * emojis — and every control labelled the way an attorney would say it, not the
 * way an image format would.
 *
 * The format list is DATA (`EXPORT_FORMATS`): adding a format adds a row here
 * with no code change, which is the same seam the main-process registry uses.
 */

import { EXPORT_FORMATS } from '@shared/export-formats';
import type { ExportColorMode, ExportFormat, ExportResult } from '@shared/types';
import {
  ActionButton,
  Caution,
  ChoiceField,
  Field,
  Hint,
  NumberField,
  Problem,
  Receipt,
  Working,
} from '@renderer/features/stamps';
import { receiptText, showInFolderTarget } from './export-messages';
import { DPI_CHOICES } from './export-settings';
import type { ExportController, ExportForm } from './use-export';

const FIELD =
  'rounded-md border border-armory-border bg-armory-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-armory-focus';

const DPI_OPTIONS = DPI_CHOICES.map((dpi) => ({ value: String(dpi), label: `${dpi} dpi` }));

const COLOR_OPTIONS: readonly { value: ExportColorMode; label: string }[] = [
  { value: 'color', label: 'Color' },
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'bw', label: 'Black and white' },
];

const COLOR_HINTS: Record<ExportColorMode, string> = {
  color: 'The page exactly as it looks on screen.',
  grayscale: 'Shades of gray. Roughly a third the file size.',
  bw: 'Black and white (smallest, like a fax). Right for scanned text, poor for photographs.',
};

export function FormatPicker({
  value,
  onChange,
}: {
  value: ExportFormat;
  onChange(format: ExportFormat): void;
}) {
  return (
    <div role="radiogroup" aria-label="Export format" className="flex flex-col gap-1">
      {EXPORT_FORMATS.map((info) => {
        const chosen = info.format === value;
        return (
          <button
            key={info.format}
            type="button"
            role="radio"
            aria-checked={chosen}
            title={info.label}
            onClick={() => onChange(info.format)}
            className={`rounded-md border px-2 py-2 text-left transition-colors duration-150 ${
              chosen
                ? 'border-brand-600 bg-armory-elevated'
                : 'border-armory-border hover:bg-armory-interactive'
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${chosen ? 'bg-brand-600' : 'bg-text-muted'}`}
              />
              <span className="text-xs font-medium text-text-primary">{info.label}</span>
            </span>
            {chosen && (
              <span className="mt-1 block pl-4 text-xs leading-relaxed text-text-secondary">
                {info.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface RangeRowProps {
  pageCount: number;
  value: string;
  error: string | null;
  note: string;
  onChange(value: string): void;
}

export function RangeRow({ pageCount, value, error, note, onChange }: RangeRowProps) {
  return (
    <>
      <Field label={`Pages (of ${pageCount})`}>
        <input
          value={value}
          placeholder="all, or 1-30, 45"
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD} font-mono`}
        />
      </Field>
      <p className={`text-xs ${error === null ? 'text-text-muted' : 'text-danger'}`}>
        {error ?? note}
      </p>
    </>
  );
}

interface SettingsProps {
  form: ExportForm;
  update(patch: Partial<ExportForm>): void;
}

export function PictureSettings({ form, update }: SettingsProps) {
  return (
    <>
      <ChoiceField
        label="Detail"
        value={String(form.dpi)}
        options={DPI_OPTIONS}
        onChange={(dpi) => update({ dpi: Number(dpi) })}
      />
      <Hint>Higher numbers mean sharper images and bigger files. 200 suits most work.</Hint>
      <ChoiceField
        label="Color"
        value={form.color}
        options={COLOR_OPTIONS}
        onChange={(color) => update({ color })}
      />
      <Hint>{COLOR_HINTS[form.color]}</Hint>
      {form.format === 'jpeg' && (
        <NumberField
          label="JPEG quality (1-100)"
          value={form.quality}
          min={1}
          max={100}
          onChange={(quality) => update({ quality })}
        />
      )}
    </>
  );
}

export function Destination({ summary, onChoose }: { summary: string; onChoose(): void }) {
  return (
    <>
      <ActionButton label="Choose where to save..." variant="quiet" onClick={onChoose} />
      <p className="text-xs leading-relaxed break-all text-text-secondary">{summary}</p>
    </>
  );
}

function DoneReceipt({ result }: { result: ExportResult }) {
  return (
    <>
      <Receipt message={receiptText(result)} />
      {result.notes.map((note) => (
        <Hint key={note}>{note}</Hint>
      ))}
      <ActionButton
        label="Show in folder"
        variant="quiet"
        onClick={() => void window.librarius.app.openPath(showInFolderTarget(result))}
      />
    </>
  );
}

interface RunControlsProps {
  controller: ExportController;
  pages: readonly number[];
  disabled: boolean;
  label: string;
}

export function RunControls({ controller, pages, disabled, label }: RunControlsProps) {
  const { state } = controller;
  if (state.phase === 'running') {
    return (
      <>
        <Working label="Exporting" progress={state.progress} />
        <ActionButton label="Stop" variant="quiet" onClick={() => controller.cancel()} />
      </>
    );
  }
  return (
    <>
      <ActionButton label={label} disabled={disabled} onClick={() => controller.start(pages)} />
      {state.phase === 'failed' && state.error !== null && <Problem message={state.error} />}
      {state.phase === 'stopped' && state.error !== null && <Caution>{state.error}</Caution>}
      {state.phase === 'done' && state.result !== null && <DoneReceipt result={state.result} />}
    </>
  );
}

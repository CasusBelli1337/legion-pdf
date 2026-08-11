/**
 * Importing a signature: see it, clean it up, then keep it.
 *
 * Attorneys photograph a signed sheet of paper. Dropped on a page untouched,
 * that lands as a rectangle of grey paper covering the document. So the import
 * shows the photo and the cleaned-up version side by side, and the attorney
 * decides — one plain-English slider, no thresholds, no channels, no jargon.
 *
 * The "after" panel sits on a chequerboard so transparency is visible as
 * transparency rather than as white.
 */

import { ActionButton, Hint, Problem, Toggle } from '@renderer/features/stamps';
import type { Pixels } from './signature-cleanup';
import { useCleanupPreview } from './use-cleanup-preview';

/**
 * A chequerboard drawn in CSS: what is transparent has to LOOK transparent.
 * Deliberately LIGHT, against the dark panel around it — a cleaned signature is
 * dark ink, and on a dark chequer the attorney would be squinting at their own
 * strokes to judge whether the clean-up ate any of them.
 */
const CHEQUER =
  'bg-white bg-[length:12px_12px] bg-[linear-gradient(45deg,#d4d4d8_25%,transparent_25%),linear-gradient(-45deg,#d4d4d8_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d4d4d8_75%),linear-gradient(-45deg,transparent_75%,#d4d4d8_75%)] bg-[position:0_0,0_6px,6px_-6px,-6px_0]';

function Panel({
  title,
  url,
  chequered,
}: {
  title: string;
  url: string | null;
  chequered: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="readout text-text-muted">{title}</span>
      <div
        className={`flex h-24 items-center justify-center rounded-md border border-armory-border ${
          chequered ? CHEQUER : 'bg-white'
        }`}
      >
        {url === null ? (
          <span className="text-[10px] text-text-muted">Working...</span>
        ) : (
          <img src={url} alt={title} className="max-h-[5.5rem] max-w-full object-contain" />
        )}
      </div>
    </div>
  );
}

function Sensitivity({ value, onChange }: { value: number; onChange(value: number): void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">How much of the pen stroke to keep</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label="How much of the pen stroke to keep"
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-purple-600"
      />
      <span className="flex justify-between text-[10px] text-text-muted">
        <span>Only the darkest ink</span>
        <span>Every faint line</span>
      </span>
    </label>
  );
}

export interface SignatureImportDialogProps {
  file: File;
  busy: boolean;
  /** `cleaned` is null when the attorney kept the original image as it is. */
  onImport(cleaned: Pixels | null): void;
  onCancel(): void;
}

export function SignatureImportDialog({
  file,
  busy,
  onImport,
  onCancel,
}: SignatureImportDialogProps) {
  const preview = useCleanupPreview(file);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-armory-border bg-armory-elevated p-3">
      <p className="truncate text-xs text-text-secondary" title={file.name}>
        {file.name}
      </p>

      <div className="flex gap-2">
        <Panel title="As photographed" url={preview.originalUrl} chequered={false} />
        <Panel
          title={preview.clean ? 'Cleaned up' : 'Imported as-is'}
          url={preview.clean ? preview.cleanedUrl : preview.originalUrl}
          chequered={preview.clean}
        />
      </div>

      <Toggle
        label="Clean up scan (keep the pen strokes, drop the paper)"
        checked={preview.clean}
        onChange={preview.setClean}
      />
      {preview.clean && (
        <Sensitivity value={preview.sensitivity} onChange={preview.setSensitivity} />
      )}
      {!preview.clean && (
        <Hint>The image goes into your library exactly as it is, background and all.</Hint>
      )}
      {preview.error !== null && <Problem message={preview.error} />}

      <div className="flex gap-2">
        <ActionButton
          label={busy ? 'Adding...' : 'Add to my signatures'}
          disabled={busy || preview.error !== null || (preview.clean && preview.cleaned === null)}
          onClick={() => onImport(preview.clean ? preview.cleaned : null)}
        />
        <ActionButton label="Cancel" variant="quiet" onClick={onCancel} />
      </div>
    </div>
  );
}

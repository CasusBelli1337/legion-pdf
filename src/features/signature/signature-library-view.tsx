/**
 * The library grid: one tile per stored signature, showing the signature itself
 * when the main process sent the image with it and a plain labelled tile when
 * it did not. Importing is a normal file picker and removing asks first, so
 * there is nothing to learn.
 */

import { useRef } from 'react';
import { X } from 'lucide-react';
import type { SignatureAsset } from '@shared/types';

const REMOVE_CONFIRM =
  'Remove this signature from your library? Documents already signed are not affected.';

interface TileProps {
  signature: SignatureAsset;
  selected: boolean;
  busy: boolean;
  onSelect(): void;
  onRemove(): void;
}

function SignatureTile({ signature, selected, busy, onSelect, onRemove }: TileProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={signature.label}
        className={`flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border bg-armory-base p-1 transition-colors duration-150 ${
          selected
            ? 'border-purple-500 shadow-glow-sm'
            : 'border-armory-border hover:border-armory-border-strong'
        }`}
      >
        {signature.dataUrl === undefined ? (
          <span className="readout text-text-muted">
            {signature.widthPx}x{signature.heightPx}
          </span>
        ) : (
          <img
            src={signature.dataUrl}
            alt={signature.label}
            /* Paper-white behind the image: scanned signatures are black ink on
               a transparent background, invisible against the dark tile. */
            className="max-h-9 max-w-full rounded-sm bg-white object-contain"
          />
        )}
        <span className="w-full truncate text-center text-[10px] text-text-secondary">
          {signature.label}
        </span>
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={`Remove ${signature.label}`}
        title="Remove from your library"
        onClick={() => {
          if (window.confirm(REMOVE_CONFIRM)) onRemove();
        }}
        className="absolute right-0 top-0 rounded bg-armory-elevated/90 p-1 text-text-muted transition-colors duration-150 hover:bg-armory-interactive hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}

function ImportButton({ busy, onImport }: { busy: boolean; onImport(file: File): void }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={picker}
        type="file"
        accept="image/png,.png"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) onImport(file);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
        className="rounded-md border border-armory-border-strong px-3 py-2 text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Importing...' : 'Import a signature image'}
      </button>
    </>
  );
}

interface LibraryViewProps {
  signatures: readonly SignatureAsset[];
  selectedId: string | null;
  busy: boolean;
  onSelect(signature: SignatureAsset): void;
  onRemove(signature: SignatureAsset): void;
  onImport(file: File): void;
}

export function SignatureLibraryView({
  signatures,
  selectedId,
  busy,
  onSelect,
  onRemove,
  onImport,
}: LibraryViewProps) {
  return (
    <div className="flex flex-col gap-2">
      {signatures.length === 0 ? (
        <p className="text-xs text-text-muted">
          No signatures yet. Import a PNG with a transparent background.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {signatures.map((signature) => (
            <SignatureTile
              key={signature.id}
              signature={signature}
              selected={signature.id === selectedId}
              busy={busy}
              onSelect={() => onSelect(signature)}
              onRemove={() => onRemove(signature)}
            />
          ))}
        </div>
      )}

      <ImportButton busy={busy} onImport={onImport} />
    </div>
  );
}

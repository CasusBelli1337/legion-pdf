/**
 * The library grid: one tile per stored signature, thumbnail if the browser
 * will show it and a plain labelled tile if it will not. Importing is a normal
 * file picker, so there is nothing to learn.
 */

import { useRef, useState } from 'react';
import type { SignatureAsset } from '@shared/types';
import { fileUrl } from './file-url';

interface TileProps {
  signature: SignatureAsset;
  selected: boolean;
  onSelect(): void;
}

function SignatureTile({ signature, selected, onSelect }: TileProps) {
  const [showable, setShowable] = useState(true);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={signature.label}
      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border bg-armory-base p-1 transition-colors duration-150 ${
        selected
          ? 'border-purple-500 shadow-glow-sm'
          : 'border-armory-border hover:border-armory-border-strong'
      }`}
    >
      {showable ? (
        <img
          src={fileUrl(signature.filePath)}
          alt={signature.label}
          onError={() => setShowable(false)}
          className="max-h-9 max-w-full object-contain"
        />
      ) : (
        <span className="readout text-text-muted">
          {signature.widthPx}x{signature.heightPx}
        </span>
      )}
      <span className="w-full truncate text-center text-[10px] text-text-secondary">
        {signature.label}
      </span>
    </button>
  );
}

interface LibraryViewProps {
  signatures: readonly SignatureAsset[];
  selectedId: string | null;
  busy: boolean;
  onSelect(signature: SignatureAsset): void;
  onImport(file: File): void;
}

export function SignatureLibraryView({
  signatures,
  selectedId,
  busy,
  onSelect,
  onImport,
}: LibraryViewProps) {
  const picker = useRef<HTMLInputElement>(null);

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
              onSelect={() => onSelect(signature)}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}

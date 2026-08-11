/**
 * The library grid: one tile per stored signature.
 *
 * A tile is a drag HANDLE first and a button second — the attorney drags their
 * signature out of this grid and drops it on the page, which is the gesture
 * they expected the first time they opened the panel. Pressing without moving
 * still arms it for click-to-place, and the keyboard does the same, so nothing
 * is only reachable by dragging.
 */

import { useRef } from 'react';
import { X } from 'lucide-react';
import type { SignatureAsset } from '@shared/types';
import type { SignatureDrag } from './signature-drag';

const REMOVE_CONFIRM =
  'Remove this signature from your library? Documents already signed are not affected.';

/** What the file picker offers. Photos are cleaned up on the way in. */
const ACCEPTED = 'image/png,image/jpeg,.png,.jpg,.jpeg';

interface TileProps {
  signature: SignatureAsset;
  selected: boolean;
  busy: boolean;
  drag: SignatureDrag;
  onSelect(): void;
  onRemove(): void;
}

function SignatureTile({ signature, selected, busy, drag, onSelect, onRemove }: TileProps) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={selected}
        title={`${signature.label} — drag onto the page, or click and then click the page`}
        {...drag.handlers(signature)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={`flex h-16 w-full cursor-grab touch-none flex-col items-center justify-center gap-1 rounded-md border bg-armory-base p-1 transition-colors duration-150 ${
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
            draggable={false}
            /* Paper-white behind the image: a cleaned-up signature is dark ink
               on a transparent background, invisible against the dark tile. */
            className="pointer-events-none max-h-9 max-w-full rounded-sm bg-white object-contain"
          />
        )}
        <span className="pointer-events-none w-full truncate text-center text-[10px] text-text-secondary">
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

function ImportButton({ busy, onPick }: { busy: boolean; onPick(file: File): void }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={picker}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) onPick(file);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
        className="rounded-md border border-armory-border-strong px-3 py-2 text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Importing...' : 'Import a signature photo or PNG'}
      </button>
    </>
  );
}

interface LibraryViewProps {
  signatures: readonly SignatureAsset[];
  selectedId: string | null;
  busy: boolean;
  drag: SignatureDrag;
  onSelect(signature: SignatureAsset): void;
  onRemove(signature: SignatureAsset): void;
  onPick(file: File): void;
}

export function SignatureLibraryView({
  signatures,
  selectedId,
  busy,
  drag,
  onSelect,
  onRemove,
  onPick,
}: LibraryViewProps) {
  return (
    <div className="flex flex-col gap-2">
      {signatures.length === 0 ? (
        <p className="text-xs text-text-muted">
          No signatures yet. Import a photo of your signature — the paper behind it is cleaned off
          for you.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {signatures.map((signature) => (
            <SignatureTile
              key={signature.id}
              signature={signature}
              selected={signature.id === selectedId}
              busy={busy}
              drag={drag}
              onSelect={() => onSelect(signature)}
              onRemove={() => onRemove(signature)}
            />
          ))}
        </div>
      )}

      <ImportButton busy={busy} onPick={onPick} />
    </div>
  );
}

/** The signature that follows the pointer while it is being dragged. */
export function DragGhostLayer({ drag }: { drag: SignatureDrag }) {
  const ghost = drag.ghost;
  if (ghost === null) return null;
  const source = ghost.signature.dataUrl;
  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-purple-400 bg-white/90 p-0.5 opacity-80"
      style={{ left: `${ghost.x}px`, top: `${ghost.y}px` }}
    >
      {source === undefined ? (
        <span className="readout px-2 text-text-inverse">{ghost.signature.label}</span>
      ) : (
        <img src={source} alt="" className="h-10 w-auto max-w-[12rem] object-contain" />
      )}
    </div>
  );
}

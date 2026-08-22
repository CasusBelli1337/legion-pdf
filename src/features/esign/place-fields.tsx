/**
 * Arming a field: pick whose it is, click a kind, click the page. The armed
 * kind stays highlighted until the click lands, Escape (or a second click on
 * the button) backs out, and every box placed belongs to the signer whose
 * chip is lit.
 */

import type { EsignFieldKind } from '@shared/types';
import { Hint, Section } from '@renderer/features/stamps';
import { FIELD_TITLES } from './field-geometry';
import { useEsignStore, type RequestSigner } from './request-store';
import { accentAt } from './signer-colors';

const KINDS: readonly EsignFieldKind[] = ['signature', 'initials', 'name', 'date', 'text'];

interface SignerChipsProps {
  signers: readonly RequestSigner[];
  activeSignerId: string | null;
  onChoose(signerId: string): void;
}

function SignerChips({ signers, activeSignerId, onChoose }: SignerChipsProps) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Placing fields for">
      {signers.map((signer, index) => {
        const active = signer.id === activeSignerId;
        const accent = accentAt(index);
        return (
          <button
            key={signer.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChoose(signer.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors duration-150 ${
              active
                ? `${accent.chip} bg-armory-interactive`
                : 'border-armory-border text-text-secondary hover:bg-armory-interactive hover:text-text-primary'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} aria-hidden />
            <span className="max-w-32 truncate">{signer.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function KindButtons({
  placing,
  onArm,
}: {
  placing: EsignFieldKind | null;
  onArm(kind: EsignFieldKind | null): void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={placing === kind}
          onClick={() => onArm(placing === kind ? null : kind)}
          className={`rounded-md px-2 py-1.5 text-xs transition-colors duration-150 ${
            placing === kind
              ? 'bg-brand-700 text-text-on-brand'
              : 'border border-armory-border text-text-secondary hover:bg-armory-interactive hover:text-text-primary'
          }`}
        >
          {FIELD_TITLES[kind]}
        </button>
      ))}
    </div>
  );
}

export interface PlaceFieldsSectionProps {
  signers: readonly RequestSigner[];
  activeSignerId: string | null;
  onChoose(signerId: string): void;
}

export function PlaceFieldsSection({ signers, activeSignerId, onChoose }: PlaceFieldsSectionProps) {
  const placing = useEsignStore((state) => state.placing);
  const setPlacing = useEsignStore((state) => state.setPlacing);

  if (signers.length === 0) {
    return (
      <Section title="Place fields">
        <Hint>Add a signer first — every field belongs to one signer.</Hint>
      </Section>
    );
  }
  return (
    <Section title="Place fields">
      <SignerChips signers={signers} activeSignerId={activeSignerId} onChoose={onChoose} />
      <KindButtons placing={placing} onArm={setPlacing} />
      {placing !== null && <Hint>Click on the page to place the box — Esc cancels.</Hint>}
    </Section>
  );
}

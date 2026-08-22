/**
 * Which colour a signer's marks wear, everywhere they appear: the dot beside
 * their name, the chip that arms placement for them, and the field boxes on
 * the page. Colour follows the signer's position in the document's signer
 * list, cycling through four accents (tokens.css `--color-esign-signer-*`).
 *
 * Class names are FULL literals, never assembled at runtime — Tailwind only
 * emits utilities it can see spelled out in the source.
 */

import type { EsignSigner } from '@shared/types';

export interface SignerAccent {
  /** The small identity dot beside the signer's name. */
  dot: string;
  /** The field box on the page: border colour plus a translucent fill. */
  box: string;
  /** Accent-coloured text — the label inside a field box. */
  text: string;
  /** The active signer chip: accent border and text on the panel surface. */
  chip: string;
}

const FIRST: SignerAccent = {
  dot: 'bg-esign-signer-1',
  box: 'border-esign-signer-1 bg-esign-signer-1/10',
  text: 'text-esign-signer-1',
  chip: 'border-esign-signer-1 text-esign-signer-1',
};

const ACCENTS: readonly SignerAccent[] = [
  FIRST,
  {
    dot: 'bg-esign-signer-2',
    box: 'border-esign-signer-2 bg-esign-signer-2/10',
    text: 'text-esign-signer-2',
    chip: 'border-esign-signer-2 text-esign-signer-2',
  },
  {
    dot: 'bg-esign-signer-3',
    box: 'border-esign-signer-3 bg-esign-signer-3/10',
    text: 'text-esign-signer-3',
    chip: 'border-esign-signer-3 text-esign-signer-3',
  },
  {
    dot: 'bg-esign-signer-4',
    box: 'border-esign-signer-4 bg-esign-signer-4/10',
    text: 'text-esign-signer-4',
    chip: 'border-esign-signer-4 text-esign-signer-4',
  },
];

/** The accent for the signer at this position in the document's signer list. */
export function accentAt(index: number): SignerAccent {
  return ACCENTS[Math.abs(index) % ACCENTS.length] ?? FIRST;
}

/** The accent a signer's fields wear, looked up by their list position. */
export function accentForSigner(signers: readonly EsignSigner[], signerId: string): SignerAccent {
  const index = signers.findIndex((signer) => signer.id === signerId);
  return accentAt(index < 0 ? 0 : index);
}

/** The signer's display name, for field labels — never blank on the page. */
export function signerNameOf(signers: readonly EsignSigner[], signerId: string): string {
  const name = signers.find((signer) => signer.id === signerId)?.name.trim();
  return name === undefined || name === '' ? 'Signer' : name;
}

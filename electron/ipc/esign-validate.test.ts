import { describe, expect, it } from 'vitest';
import type { EsignField, EsignSigner } from '@shared/types';
import { assertPlacementsValid } from './esign-validate';

const SIGNERS: EsignSigner[] = [
  { id: 's1', name: 'Maria Vance', email: 'maria.vance@example.com' },
  { id: 's2', name: 'Declan Ruiz', email: 'declan.ruiz@example.com' },
];

function field(overrides: Partial<EsignField> = {}): EsignField {
  return {
    id: 'f1',
    kind: 'signature',
    signerId: 's1',
    page: 1,
    rect: { x: 72, y: 500, width: 220, height: 50 },
    required: true,
    ...overrides,
  };
}

describe('assertPlacementsValid', () => {
  it('accepts a complete request', () => {
    expect(() =>
      assertPlacementsValid(SIGNERS, [field(), field({ id: 'f2', page: 3, signerId: 's2' })], 3)
    ).not.toThrow();
  });

  it('requires at least one signer', () => {
    expect(() => assertPlacementsValid([], [field()], 3)).toThrow('Add at least one signer first.');
  });

  it('requires at least one field', () => {
    expect(() => assertPlacementsValid(SIGNERS, [], 3)).toThrow(
      'Place at least one field on the document first.'
    );
  });

  it('names a field whose signer left the request', () => {
    expect(() =>
      assertPlacementsValid(SIGNERS, [field({ signerId: 'ghost', page: 2 })], 3)
    ).toThrow('The signature field on page 2 belongs to a signer who is no longer on the request.');
  });

  it('names a field past the end of the document', () => {
    expect(() => assertPlacementsValid(SIGNERS, [field({ page: 9 })], 3)).toThrow(
      'A signature field sits on page 9, but this document has only 3 page(s).'
    );
  });

  it('refuses page zero and fractional pages', () => {
    expect(() => assertPlacementsValid(SIGNERS, [field({ page: 0 })], 3)).toThrow(/page 0/);
    expect(() => assertPlacementsValid(SIGNERS, [field({ page: 1.5 })], 3)).toThrow(/page 1.5/);
  });
});

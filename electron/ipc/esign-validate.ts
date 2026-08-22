/**
 * Request validation for the esign:* handlers, split out of ./esign so the
 * rules unit-test without Electron. Loud and specific by design: a field on
 * a page the document does not have, or owned by a signer who was removed,
 * is refused by name before any bytes leave the machine.
 */

import type { EsignField, EsignSigner } from '@shared/types';

function assertFieldValid(field: EsignField, known: ReadonlySet<string>, pageCount: number): void {
  if (!known.has(field.signerId)) {
    throw new Error(
      `The ${field.kind} field on page ${field.page} belongs to a signer ` +
        'who is no longer on the request.'
    );
  }
  if (!Number.isInteger(field.page) || field.page < 1 || field.page > pageCount) {
    throw new Error(
      `A ${field.kind} field sits on page ${field.page}, but this document ` +
        `has only ${pageCount} page(s).`
    );
  }
}

/**
 * The shared gate for esign:createRequest and esign:exportFillable — both
 * need at least one signer, at least one field, and every field on a real
 * page and a real signer. `pageCount` is the OPEN session's count, so a stale
 * panel can never send a field past the end of the document.
 */
export function assertPlacementsValid(
  signers: readonly EsignSigner[],
  fields: readonly EsignField[],
  pageCount: number
): void {
  if (signers.length === 0) {
    throw new Error('Add at least one signer first.');
  }
  if (fields.length === 0) {
    throw new Error('Place at least one field on the document first.');
  }
  const known = new Set(signers.map((signer) => signer.id));
  for (const field of fields) assertFieldValid(field, known, pageCount);
}

/**
 * The verification pass — the reason this feature can be trusted.
 *
 * It runs against the SAVED OUTPUT BYTES, re-opened from scratch, never against
 * the document object the burn step built. Two independent gates have to agree:
 *
 *   1. Byte residue. Every stream in the file is inflated and searched for each
 *      marked string in all three encodings (residue-scan.ts).
 *   2. Page silence. Every rebuilt page is re-read from its own content streams
 *      and must show ZERO characters, because a page rebuilt from a raster draws
 *      one image and nothing else. When the user asked to keep the document
 *      searchable, the fresh text layer is searched for the marked strings
 *      instead — it was generated from the burned pixels, so it cannot name what
 *      the pixels no longer show.
 *
 * A pass with nothing to check is a failure, not a pass: `verifyRedaction`
 * throws rather than certify a document against zero assertions.
 */

import { PDFDocument } from 'pdf-lib';
import type { RedactVerifyResult } from '@shared/types';
import { RedactionNotVerifiedError } from './types';
import { pageContentText, shownCharactersOn } from './page-content';
import { residueOf } from './residue-scan';

export interface VerifyRequest {
  /** The saved output. Re-opened here; never the in-memory document. */
  bytes: Uint8Array;
  /** Strings that must be absent. */
  strings: readonly string[];
  /** 1-based pages the burn rebuilt. */
  pagesRebuilt: readonly number[];
  /**
   * True while the rebuilt pages are still pure images. Set false only for the
   * second pass, after a text layer has deliberately been written back on.
   */
  expectNoTextOnRebuiltPages: boolean;
  /** Marks destroyed, for the receipt. */
  instancesDestroyed: number;
}

/** How a page that still draws text is reported through `survivingStrings`. */
export function textOnPageMarker(page: number): string {
  return `text still drawn on page ${page}`;
}

function checkPages(document: PDFDocument, request: VerifyRequest): string[] {
  const failures: string[] = [];
  for (const page of request.pagesRebuilt) {
    if (request.expectNoTextOnRebuiltPages) {
      if (shownCharactersOn(document, page) > 0) failures.push(textOnPageMarker(page));
      continue;
    }
    const content = pageContentText(document, page);
    for (const needle of request.strings) {
      if (content.includes(needle.toLowerCase())) failures.push(needle);
    }
  }
  return failures;
}

function assertSomethingToCheck(request: VerifyRequest): void {
  const checks =
    request.strings.length + (request.expectNoTextOnRebuiltPages ? request.pagesRebuilt.length : 0);
  if (checks === 0) {
    throw new Error(
      'Verification was asked to prove nothing — refusing to certify a redaction it did not check.'
    );
  }
}

/**
 * Prove the marked content is gone from `bytes`. Never throws on a failed
 * proof: it reports `verified: false` with the survivors so the caller can
 * refuse the document. It throws only when it could not run a real check.
 */
export async function verifyRedaction(request: VerifyRequest): Promise<RedactVerifyResult> {
  if (request.bytes.byteLength === 0) {
    throw new Error('Verification was handed an empty document.');
  }
  assertSomethingToCheck(request);
  const document = await PDFDocument.load(request.bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  for (const page of request.pagesRebuilt) {
    if (page < 1 || page > document.getPageCount()) {
      throw new RangeError(
        `Verification was told page ${page} was rebuilt, but the output has ` +
          `${document.getPageCount()} pages.`
      );
    }
  }
  const survivingStrings = [
    ...new Set([...residueOf(request.bytes, request.strings), ...checkPages(document, request)]),
  ];
  return {
    verified: survivingStrings.length === 0,
    pagesRebuilt: [...request.pagesRebuilt],
    instancesDestroyed: request.instancesDestroyed,
    survivingStrings,
  };
}

/** The gate: anything unverified stops here and never reaches the user. */
export function assertVerified(result: RedactVerifyResult): void {
  if (!result.verified) throw new RedactionNotVerifiedError(result.survivingStrings);
}

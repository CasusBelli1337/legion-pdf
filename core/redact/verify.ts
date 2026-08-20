/**
 * The verification pass — the reason this feature can be trusted.
 *
 * It runs against the SAVED OUTPUT BYTES, re-opened from scratch, never against
 * the document object the burn step built. Two independent gates have to agree:
 *
 *   1. Page silence. Every rebuilt page is re-read from its own content streams
 *      and must show ZERO characters, because a page rebuilt from a raster draws
 *      one image and nothing else. That is a region proof by construction: if
 *      the whole page is silent, so is every marked rectangle on it. (When the
 *      user asked to keep the document searchable, a fresh text layer is written
 *      back on afterwards, so this gate is switched off for that second pass and
 *      the count check below carries it.)
 *   2. Instance accounting. Redaction destroys what was MARKED. So each term is
 *      counted in the source and counted again in the output, and at least as
 *      many copies must have vanished as the attorney marked. Copies elsewhere
 *      in the document were never part of the request: leaving them standing is
 *      the correct outcome, and failing the run over them would tell an attorney
 *      their marked text survived when it did not. A term nobody marked keeps
 *      the absolute rule — prove it is not there at all.
 *
 * A pass with nothing to check is a failure, not a pass: `verifyRedaction`
 * throws rather than certify a document against zero assertions.
 */

import { PDFDocument } from 'pdf-lib';
import type { RedactVerifyResult, RedactedTerm } from '@shared/types';
import { RedactionNotVerifiedError } from './types';
import { shownCharactersOn } from './page-content';
import { countEachOccurrence } from './residue-scan';

/**
 * One term, with what the SOURCE document held and how much of it was marked.
 * Both numbers are taken before anything is destroyed; the pass supplies the
 * third by counting the output for itself.
 */
export interface VerifyTarget {
  /** The term as the attorney marked it. */
  text: string;
  /** Occurrences the source held, counted over every encoding. */
  occurrencesBefore: number;
  /** Instances of it the attorney marked. Zero means "prove it is absent". */
  markedInstances: number;
}

export interface VerifyRequest {
  /** The saved output. Re-opened here; never the in-memory document. */
  bytes: Uint8Array;
  /** The terms to account for. */
  targets: readonly VerifyTarget[];
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

interface TermFinding extends RedactedTerm {
  /** True when the marked copies of this term really are gone. */
  proved: boolean;
}

/**
 * The verdict for one term.
 *
 * Counting only proves something when the source count is real: text drawn
 * glyph by glyph, or split across text runs, is invisible to a byte scan, and a
 * term the scan could never see must not be failed for not shrinking. In that
 * case the question falls back to the absolute one — it must not appear now —
 * and page silence plus the renderer's pdfjs gate carry the rest.
 *
 * For the same reason the demand is capped at what the scan DID see: a hit that
 * pdfjs found by joining two runs is a real instance the attorney marked, yet it
 * was never one countable string in the file. Requiring more copies to vanish
 * than the file ever showed would refuse honest redactions.
 */
function judge(target: VerifyTarget, remaining: number): TermFinding {
  const destroyed = Math.max(0, target.occurrencesBefore - remaining);
  const required = Math.min(target.markedInstances, target.occurrencesBefore);
  return {
    text: target.text,
    before: target.occurrencesBefore,
    remaining,
    marked: target.markedInstances,
    proved: required > 0 ? destroyed >= required : remaining === 0,
  };
}

function checkTerms(request: VerifyRequest): TermFinding[] {
  const counted = countEachOccurrence(
    request.bytes,
    request.targets.map((target) => target.text)
  );
  return request.targets.map((target) => judge(target, counted.get(target.text) ?? 0));
}

/** Rebuilt pages that still draw text — a page that is not really an image. */
function textCarryingPages(document: PDFDocument, request: VerifyRequest): number[] {
  if (!request.expectNoTextOnRebuiltPages) return [];
  return request.pagesRebuilt.filter((page) => shownCharactersOn(document, page) > 0);
}

function assertSomethingToCheck(request: VerifyRequest): void {
  const checks =
    request.targets.length + (request.expectNoTextOnRebuiltPages ? request.pagesRebuilt.length : 0);
  if (checks === 0) {
    throw new Error(
      'Verification was asked to prove nothing — refusing to certify a redaction it did not check.'
    );
  }
}

/**
 * What the SOURCE document held, per term, so the output can be compared with
 * it. Built before a single page is burned — after the rebuild there is nothing
 * left to count.
 */
export function censusOf(
  bytes: Uint8Array,
  strings: readonly string[],
  markedInstances: ReadonlyMap<string, number>
): VerifyTarget[] {
  const counted = countEachOccurrence(bytes, strings);
  return strings.map((text) => ({
    text,
    occurrencesBefore: counted.get(text) ?? 0,
    markedInstances: markedInstances.get(text.trim().toLowerCase()) ?? 0,
  }));
}

/**
 * Prove the MARKED content is gone from `bytes`. Never throws on a failed
 * proof: it reports `verified: false` with the terms that survived so the caller
 * can refuse the document. It throws only when it could not run a real check.
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
  const findings = checkTerms(request);
  const pagesStillCarryingText = textCarryingPages(document, request);
  const survivingStrings = findings.filter((term) => !term.proved).map((term) => term.text);
  return {
    verified: survivingStrings.length === 0 && pagesStillCarryingText.length === 0,
    pagesRebuilt: [...request.pagesRebuilt],
    instancesDestroyed: request.instancesDestroyed,
    survivingStrings,
    pagesStillCarryingText,
    terms: findings.map(({ text, before, remaining, marked }) => ({
      text,
      before,
      remaining,
      marked,
    })),
  };
}

/**
 * The gate: anything unverified stops here and never reaches the user. Either
 * failure list being non-empty is a failure — `verified` is the single flag, and
 * this refuses to trust it alone.
 */
export function assertVerified(result: RedactVerifyResult): void {
  const pages = result.pagesStillCarryingText ?? [];
  if (result.verified && result.survivingStrings.length === 0 && pages.length === 0) return;
  throw new RedactionNotVerifiedError(result.survivingStrings, pages);
}

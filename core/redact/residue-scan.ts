/**
 * HOW MANY times is the marked text still readable in the saved file?
 *
 * This module only counts; `verify.ts` decides what a count means. That split
 * matters: a term the attorney marked once may legitimately appear four more
 * times on pages nobody marked, so "found it" is not a verdict.
 *
 * A raw grep over PDF bytes is theatre: pdf-lib compresses content streams,
 * packs small objects into object streams, and writes text as hex. A marker can
 * be plainly present and completely invisible to a naive search — which is how a
 * redaction tool ends up certifying a document that still contains the secret.
 *
 * So this inflates every stream in the file and searches the result in all three
 * encodings a string can wear. The one exclusion is image sample data: those
 * streams are pixels by construction, and 25 MB of anti-aliased greys will match
 * a short needle by chance often enough to fail every honest redaction. Every
 * other byte of the document is fair game.
 */

import { inflateSync } from 'node:zlib';

/** How far back to look for the dictionary that describes a stream. */
const DICT_LOOKBACK = 2048;
const IMAGE_SUBTYPE = /\/Subtype\s*\/Image/;

/**
 * Every way a string can be stored: as a literal, as WinAnsi hex, and as
 * UTF-16BE hex. The byte-order mark that opens a UTF-16 PDF string is
 * deliberately NOT included — a marked term is usually a SUBSTRING of a longer
 * stored string (a bookmark reading "Account SSN 545-45-6789" carries one BOM,
 * at the front), and searching for a BOM-prefixed needle would sail straight
 * past it. Both hex forms are byte-aligned, so substring matching is exact.
 */
export function encodingsOf(needle: string): string[] {
  const latin1 = Buffer.from(needle, 'latin1').toString('hex');
  const utf16 = Buffer.from(needle, 'utf16le').swap16().toString('hex');
  return [needle.toLowerCase(), latin1, utf16];
}

/** True when the dictionary just before a stream declares it image samples. */
function describesAnImage(raw: string, streamStart: number): boolean {
  const objectStart = raw.lastIndexOf(' obj', streamStart);
  const from = Math.max(objectStart === -1 ? 0 : objectStart, streamStart - DICT_LOOKBACK);
  return IMAGE_SUBTYPE.test(raw.slice(from, streamStart));
}

function payloadBounds(raw: string, streamKeyword: number): number {
  let from = streamKeyword + 'stream'.length;
  if (raw[from] === '\r') from += 1;
  if (raw[from] === '\n') from += 1;
  return from;
}

/**
 * The whole file as searchable text: the raw bytes, plus the inflated contents
 * of every stream that is not an image. Streams that will not inflate are left
 * to the raw copy, which already contains them verbatim.
 */
export function scannableText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const raw = buffer.toString('latin1');
  const parts: string[] = [raw];
  let cursor = 0;
  while (cursor < raw.length) {
    const start = raw.indexOf('stream', cursor);
    if (start === -1) break;
    const from = payloadBounds(raw, start);
    const end = raw.indexOf('endstream', from);
    if (end === -1) break;
    if (!describesAnImage(raw, start)) {
      try {
        parts.push(inflateSync(buffer.subarray(from, end)).toString('latin1'));
      } catch {
        // Not a flate stream (or a corrupt one) — the raw copy already covers it.
      }
    }
    cursor = end + 'endstream'.length;
  }
  return parts.join('\n').toLowerCase();
}

/** Occurrences of one needle in an already-built haystack, over every encoding. */
function countIn(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return encodingsOf(needle).reduce((total, encoded) => total + occurrences(haystack, encoded), 0);
}

/**
 * How many times EACH needle is still readable, over a single scan of the file.
 *
 * Counting rather than answering yes-or-no is what makes verification
 * instance-scoped: the promise is that the marked copies are gone, so the
 * question is how many copies vanished, not whether the term appears at all.
 * One scan serves every needle — inflating a 500-page file once per term would
 * turn the proof into the slowest step of the run.
 */
export function countEachOccurrence(
  bytes: Uint8Array,
  needles: readonly string[]
): Map<string, number> {
  if (needles.length === 0) return new Map();
  const haystack = scannableText(bytes);
  return new Map(needles.map((needle) => [needle, countIn(haystack, needle)]));
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

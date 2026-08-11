/**
 * Is the marked text still readable ANYWHERE in the saved file?
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

/** Which of `needles` are still readable in the file. Empty means clean. */
export function residueOf(bytes: Uint8Array, needles: readonly string[]): string[] {
  if (needles.length === 0) return [];
  const haystack = scannableText(bytes);
  return needles.filter((needle) =>
    encodingsOf(needle).some((encoded) => haystack.includes(encoded))
  );
}

/**
 * How many times a string appears in the file, counting every encoding.
 * Used to prove a target really was there BEFORE — a verification that passes
 * against a string the document never contained proves nothing.
 */
export function countOccurrences(bytes: Uint8Array, needle: string): number {
  if (needle.length === 0) return 0;
  const haystack = scannableText(bytes);
  return encodingsOf(needle).reduce((total, encoded) => total + occurrences(haystack, encoded), 0);
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

/**
 * PackBits (TIFF compression 32773) — the run-length scheme baseline TIFF 6.0
 * requires every reader to understand.
 *
 * It is here rather than a dependency for one reason: a multi-page TIFF is what
 * courts and production vendors ask for, and a page that decompresses wrong is
 * a page that was never really exported. Twenty lines of run-length coding we
 * can test against our own reader beats a transitive package we cannot.
 *
 * Rows are compressed INDIVIDUALLY and concatenated, which the TIFF spec
 * recommends: a decoder that loses its place in one row recovers at the next.
 */

/** A literal or repeat run never spans more than 128 bytes. */
const MAX_RUN = 128;
/** Below three, a repeat run costs as much as writing the bytes out. */
const MIN_REPEAT = 3;

function byteAt(row: Uint8Array, index: number): number {
  return row[index] ?? 0;
}

/** How many identical bytes start at `start`, capped at one run. */
function repeatLength(row: Uint8Array, start: number): number {
  const value = byteAt(row, start);
  let length = 1;
  while (start + length < row.length && length < MAX_RUN && byteAt(row, start + length) === value) {
    length += 1;
  }
  return length;
}

/** How many bytes to copy verbatim before a repeat run becomes worth coding. */
function literalLength(row: Uint8Array, start: number): number {
  let index = start + 1;
  while (index < row.length && index - start < MAX_RUN) {
    if (repeatLength(row, index) >= MIN_REPEAT) break;
    index += 1;
  }
  return index - start;
}

/** Worst case: every 128 bytes pay one header byte, and nothing ever repeats. */
export function packBitsCeiling(length: number): number {
  return length + Math.ceil(length / MAX_RUN) + 1;
}

/**
 * Compresses one row into `out` at `cursor`, answering the new cursor. Writing
 * into a caller-owned buffer keeps a 600-DPI page from allocating per row.
 */
export function packBitsInto(row: Uint8Array, out: Uint8Array, cursor: number): number {
  let index = 0;
  let at = cursor;
  while (index < row.length) {
    const repeat = repeatLength(row, index);
    if (repeat >= MIN_REPEAT) {
      out[at] = 257 - repeat;
      out[at + 1] = byteAt(row, index);
      at += 2;
      index += repeat;
      continue;
    }
    const literal = literalLength(row, index);
    out[at] = literal - 1;
    out.set(row.subarray(index, index + literal), at + 1);
    at += literal + 1;
    index += literal;
  }
  return at;
}

/** One row, compressed into its own buffer — the shape the tests read. */
export function packBits(row: Uint8Array): Uint8Array {
  const out = new Uint8Array(packBitsCeiling(row.length));
  return out.subarray(0, packBitsInto(row, out, 0));
}

/**
 * A strip: `rowCount` rows of `stride` bytes, each row packed on its own.
 * Refuses an empty result for a non-empty strip — a zero-byte strip is the
 * silent-truncation failure this codec exists to make impossible.
 */
export function packBitsStrip(
  samples: Uint8Array,
  stride: number,
  firstRow: number,
  rowCount: number
): Uint8Array {
  // Rows are packed one at a time, so the headroom is per ROW, not per strip.
  const out = new Uint8Array(packBitsCeiling(stride) * rowCount);
  let cursor = 0;
  for (let row = firstRow; row < firstRow + rowCount; row += 1) {
    cursor = packBitsInto(samples.subarray(row * stride, (row + 1) * stride), out, cursor);
  }
  if (cursor === 0 && rowCount > 0) {
    throw new RangeError(`PackBits produced no output for ${rowCount} rows of ${stride} bytes.`);
  }
  return out.slice(0, cursor);
}

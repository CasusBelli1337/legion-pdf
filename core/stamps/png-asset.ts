/**
 * The gate every signature image passes before it reaches the library or a
 * page: it must really be a PNG, and it must be a sane size.
 *
 * Only the IHDR header is read — width, height, and the magic bytes. (OCR's
 * core/ocr/png-blank.ts decodes pixels and therefore refuses palette and
 * 16-bit PNGs; a signature only needs its dimensions, and refusing a perfectly
 * good palette PNG on those grounds would be a bug, not a safeguard.)
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const HEADER_LENGTH = 24;

/** Signature images live in userData; five megabytes is already a huge scan. */
export const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024;

export interface PngInfo {
  width: number;
  height: number;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}

/** True when the bytes start with the PNG magic number. */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > HEADER_LENGTH && SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * Width and height of a PNG, refusing anything that is not one. Plain-English
 * errors: the attorney picked a file, not a byte stream.
 */
export function readPngInfo(bytes: Uint8Array, label = 'signature image'): PngInfo {
  if (bytes.byteLength > MAX_SIGNATURE_BYTES) {
    throw new RangeError(
      `That ${label} is ${Math.round(bytes.byteLength / 1024 / 1024)} MB. ` +
        `Please use a PNG under ${MAX_SIGNATURE_BYTES / 1024 / 1024} MB.`
    );
  }
  if (!isPng(bytes)) {
    throw new RangeError(`That ${label} is not a PNG file — save it as a PNG and try again.`);
  }
  const width = readUint32(bytes, IHDR_WIDTH_OFFSET);
  const height = readUint32(bytes, IHDR_HEIGHT_OFFSET);
  if (width < 1 || height < 1) {
    throw new RangeError(`That ${label} reports no size — the file looks damaged.`);
  }
  return { width, height };
}

/** The size a signature image should be placed at, given a target height. */
export function scaleToHeight(info: PngInfo, heightPt: number): { width: number; height: number } {
  return { width: (info.width / info.height) * heightPt, height: heightPt };
}

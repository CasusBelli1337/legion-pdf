/**
 * Reading a TIFF back far enough to count its pages.
 *
 * This is the count-verification gate for the TIFF export: the encoder is asked
 * for N pages, and the bytes it produced are re-read here and asked how many
 * pages they actually carry before the file is ever presented as written. A
 * TIFF that quietly lost its last IFD is exactly the "fast and empty" failure
 * the rules forbid, and nothing but a second read can catch it.
 */

const LITTLE_ENDIAN_MAGIC = 0x49;
const TIFF_VERSION = 42;
/** A chain longer than this is a corrupt file pointing at itself. */
const MAX_PAGES = 100_000;

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Number of image file directories — the page count. Throws on a bad file. */
export function countTiffPages(bytes: Uint8Array): number {
  const view = viewOf(bytes);
  const littleEndian = bytes[0] === LITTLE_ENDIAN_MAGIC && bytes[1] === LITTLE_ENDIAN_MAGIC;
  if (bytes.length < 8 || !littleEndian || view.getUint16(2, true) !== TIFF_VERSION) {
    throw new Error('These bytes are not the TIFF file this app writes.');
  }
  let offset = view.getUint32(4, true);
  let pages = 0;
  while (offset !== 0) {
    if (offset + 2 > bytes.length) {
      throw new Error(`The TIFF is truncated: a page table starts past the end of the file.`);
    }
    const entries = view.getUint16(offset, true);
    const nextAt = offset + 2 + entries * 12;
    if (nextAt + 4 > bytes.length) {
      throw new Error(`The TIFF is truncated: page ${pages + 1} has an incomplete tag table.`);
    }
    pages += 1;
    if (pages > MAX_PAGES) throw new Error('The TIFF page chain does not end.');
    offset = view.getUint32(nextAt, true);
  }
  return pages;
}

/**
 * The last gate, and the only one that reads the document the way a human does.
 *
 * The main process proves destruction twice — once over every inflated stream
 * in the file, once over the rebuilt pages' own operators. Both work on bytes.
 * Neither can see through a subset font whose glyph codes are not the letters
 * they draw, which is precisely how a "clean" file can still copy-paste the
 * secret out of Acrobat.
 *
 * pdfjs can: it is the same engine that drew the page on screen, and it maps
 * glyphs back to text. So the renderer runs one more extraction on the bytes it
 * was handed, and the tab does not open unless this agrees.
 */

import { NoTextLayerError, extractDocumentText } from '@renderer/lib/extract-text';

export interface PdfjsProofRequest {
  /** The bytes the main process just returned. */
  bytes: Uint8Array;
  /** 1-based pages that were rebuilt from a raster. */
  pages: readonly number[];
  /** Text that must not come back out. */
  needles: readonly string[];
  /** True while the rebuilt pages are pure images (no re-OCR was asked for). */
  expectNoText: boolean;
}

/** How a page that still yields selectable text is reported. */
export function selectableTextMarker(page: number): string {
  return `selectable text on page ${page}`;
}

/**
 * Everything that survived, as plain strings. An empty array is the proof.
 * A page-level failure is reported alongside the strings so the panel can show
 * one loud message either way.
 */
export async function proveWithPdfjs(request: PdfjsProofRequest): Promise<string[]> {
  if (request.pages.length === 0) return [];
  try {
    const extracted = await extractDocumentText(request.bytes, request.pages);
    const haystack = extracted.text.toLowerCase();
    const survivors = request.needles.filter((needle) =>
      haystack.includes(needle.trim().toLowerCase())
    );
    return [...survivors, ...pagesStillCarryingText(request, extracted.charsPerPage)];
  } catch (error) {
    // Every rebuilt page came back image-only. That IS the proof, not a failure.
    if (error instanceof NoTextLayerError) return [];
    throw error;
  }
}

function pagesStillCarryingText(
  request: PdfjsProofRequest,
  charsPerPage: readonly number[]
): string[] {
  if (!request.expectNoText) return [];
  return request.pages
    .filter((_page, index) => (charsPerPage[index] ?? 0) > 0)
    .map(selectableTextMarker);
}
